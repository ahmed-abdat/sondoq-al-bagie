"use client";
// Committee: one hub (payments to confirm + «سجّل دفعة») and a short menu of sub-pages, each one
// level deep with a clear «رجوع». Rare actions live inside the sub-pages, not on the main path.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { InstallEntry } from "@/components/providers";
import { CloseStalePushNotifications } from "@/components/providers/committee-push";
import { toastFor, usePaymentsRealtime } from "@/lib/data/realtime";
import type {
  Arrear,
  CampaignProgress,
  ExpenseAdmin,
  FundAccount,
  MemberAdmin,
  MemberRow,
  PendingPayment,
} from "@/lib/data/types";
import { useDemoState } from "../act";
import { MethodBadge } from "../bits";
import { CampaignAdminList, CampaignFormBody } from "../campaign-form";
import { fmt, pendingForCampaign, relativeAgo } from "../derive";
import { ShareBtns } from "../entries";
import { ExpenseAdminList, RecordExpenseBody } from "../expense";
import { I } from "../icons";
import type { MemberCtx } from "../member";
import { MembersAdmin, type MemberCredit } from "../members-admin";
import { Num, useNow } from "../num";
import { Receipt } from "../receipt";
import type { ReceiptView } from "../receipt-model";
import { PushSuggest } from "../push-suggest";
import { Segmented } from "../segmented";
import { RecordBody } from "../record";
import { LateList } from "../reminders";
import { Sheet } from "../sheet";
import { useSnack } from "../shell";
import { setPendingCount } from "../pending-count";
import { PendingSlip } from "../slip";
import type { MemberLinkInfo } from "@/lib/data/member-types";

/** Live updates: another committee member recorded or confirmed a payment → refetch the page. */
export function CommitteeLive() {
  const router = useRouter();
  const say = useSnack();
  usePaymentsRealtime({
    onRefresh: () => router.refresh(),
    onChange: (c) => {
      const text = toastFor(c);
      if (text) say(text, { label: "عرض", run: () => router.push("/committee") });
    },
  });
  return null;
}

/** Sub-page header: «رجوع» to the committee hub, the title, one line of help. */
export function SubHead({ title, lead }: { title: string; lead?: string }) {
  return (
    <header className="bq-page-h">
      <Link
        href="/committee"
        className="bq-link bq-link-s bq-back bq-press"
        transitionTypes={["tab-back"]}
      >
        {I.back(18)} رجوع إلى اللجنة
      </Link>
      <h1>{title}</h1>
      {lead && <p className="bq-lead">{lead}</p>}
    </header>
  );
}

function MenuRow({
  href,
  icon,
  title,
  sub,
  count,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  sub: string;
  count?: number;
}) {
  return (
    <li>
      <Link
        href={href}
        // the report page is heavy; load it only when asked
        prefetch={href.startsWith("/report") ? false : undefined}
        className="bq-row bq-press"
        transitionTypes={["tab-fwd"]}
      >
        <span className="bq-disc">{icon}</span>
        <span className="bq-row-m">
          <span className="bq-row-t">{title}</span>
          <span className="bq-row-s">{sub}</span>
        </span>
        {count !== undefined && <Num className="bq-amt">{count}</Num>}
        <span className="bq-chev">{I.go(18)}</span>
      </Link>
    </li>
  );
}

/* ═══════════════════════════ hub ═══════════════════════════ */
export function CommitteeView({
  pending: serverPending,
  me,
  members,
  ctx,
  accounts,
  campaigns: serverCampaigns,
  lateCount,
  memberCount,
  canManage,
}: {
  pending: PendingPayment[];
  me: { by: string; role: string; canConfirm?: boolean; memberId?: string | null };
  members: MemberRow[];
  ctx: MemberCtx;
  accounts: FundAccount[];
  campaigns: CampaignProgress[];
  lateCount: number;
  memberCount: number;
  /** admin, treasurer, deputy: campaigns and member management */
  canManage: boolean;
}) {
  const demo = useDemoState();
  const pending = [...serverPending, ...demo.pending];
  const campaigns = [...demo.campaigns, ...serverCampaigns].map((c) => ({
    ...c,
    ...demo.campaignPatch[c.campaignId],
  }));
  const say = useSnack();
  // keep decided slips on screen (collapsed) after the server list drops them
  const [seen, setSeen] = useState(pending);
  const fresh = pending.filter((p) => !seen.some((s) => s.id === p.id));
  // a new slip goes first (audit C4); after «سجّل دفعة» it is brought into view
  if (fresh.length) setSeen([...fresh, ...seen]);
  const newest = seen[0]?.id ?? null;
  /** the first slip when «سجّل دفعة» closed; a different first slip = the one just recorded */
  const [firstBefore, setFirstBefore] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (firstBefore === undefined) return;
    const t = setTimeout(() => setFirstBefore(undefined), 15_000);
    const el = newest !== firstBefore && document.getElementById(`bq-slip-${newest}`);
    if (el) {
      const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
      clearTimeout(t);
      setTimeout(() => setFirstBefore(undefined), 0);
    }
    return () => clearTimeout(t);
  }, [firstBefore, newest]);
  const [decided, setDecided] = useState<Set<string>>(new Set());
  const waiting = pending.filter((p) => !decided.has(p.id)).length;
  useEffect(() => setPendingCount(waiting), [waiting]);
  const [sheet, setSheet] = useState<{ t: "record" } | { t: "receipt"; r: ReceiptView } | null>(
    null,
  );
  const openCamps = campaigns.filter((c) => c.status === "open").length;
  // owner pick (r31): two tabs; «للمراجعة» is a chat-like list, one slip open in place (the first
  // by default); after a decision's 5 s «تراجع» window the next one opens by itself
  const [tab, setTab] = useState<"rev" | "work">("rev");
  const [openId, setOpenId] = useState<string | null | undefined>(undefined);
  const [all, setAll] = useState(false);
  const now = useNow();
  // newest first, like a chat list
  const ordered = [...seen].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const undecided = ordered.filter((p) => !decided.has(p.id));
  const openNow =
    openId !== undefined && undecided.some((p) => p.id === openId)
      ? openId
      : (undecided[0]?.id ?? null);
  const shownIds = new Set(
    (all ? undecided : undecided.slice(0, 5)).map((p) => p.id).concat(openNow ?? []),
  );

  return (
    <>
      <header className="bq-page-h">
        <h1>اللجنة</h1>
        <Link
          href="/committee/account"
          className="bq-lead bq-me-link bq-press"
          transitionTypes={["tab-fwd"]}
          aria-label={`حسابي: ${me.by}`}
        >
          {me.by}
          {me.role ? ` · ${me.role}` : ""} {I.go(16)}
        </Link>
      </header>

      <CloseStalePushNotifications pendingIds={serverPending.map((p) => p.id)} />
      {me.canConfirm && <PushSuggest />}
      <section className="bq-sec bq-sec-first">
        <Segmented
          label="اللجنة"
          value={tab}
          onChange={setTab}
          items={[
            {
              k: "rev",
              l: waiting ? (
                <>
                  للمراجعة <Num>{waiting}</Num>
                </>
              ) : (
                "للمراجعة"
              ),
            },
            { k: "work", l: "الأعمال" },
          ]}
        />
      </section>

      {tab === "rev" ? (
        <section className="bq-sec bq-rev-sec" aria-labelledby="bq-wait-h">
          <h2 id="bq-wait-h" className="bq-sr">
            بانتظار التأكيد <Num>{waiting}</Num>
          </h2>
          {seen.length > 0 && (
            <ul className="bq-rev">
              {ordered.map((p) =>
                p.id === openNow || decided.has(p.id) ? (
                  <li key={p.id} id={`bq-slip-${p.id}`} className="bq-rev-open">
                    <PendingSlip
                      p={p}
                      me={me}
                      onFull={(r) => setSheet({ t: "receipt", r })}
                      onDecided={(d) =>
                        setDecided((x) => {
                          const n = new Set(x);
                          if (d) n.add(p.id);
                          else n.delete(p.id);
                          return n;
                        })
                      }
                      onSettled={() => setOpenId(undefined)}
                    />
                  </li>
                ) : shownIds.has(p.id) ? (
                  <li key={p.id} id={`bq-slip-${p.id}`}>
                    <button
                      type="button"
                      className="bq-row bq-press bq-rev-row"
                      aria-expanded={false}
                      onClick={() => setOpenId(p.id)}
                    >
                      <MethodBadge method={p.method} size={40} label={false} />
                      <span className="bq-row-m">
                        <span className="bq-row-t">{p.payerName}</span>
                        <span className="bq-row-s">
                          {p.submittedByMember
                            ? `أرسلها ${p.submittedByMember.fullName}`
                            : p.createdByName
                              ? `سجّلها ${p.createdByName}`
                              : "سُجّلت"}
                          {now ? ` · ${relativeAgo(p.createdAt, now)}` : ""}
                        </span>
                      </span>
                      <Num className="bq-amt">{fmt(p.amount)}</Num>
                    </button>
                  </li>
                ) : null,
              )}
            </ul>
          )}
          {undecided.length > 5 && (
            <button type="button" className="bq-link bq-press" onClick={() => setAll(!all)}>
              {all ? (
                "عرض أقل"
              ) : (
                <>
                  عرض الكل <Num>{undecided.length}</Num>
                </>
              )}{" "}
              {I.chev(18)}
            </button>
          )}
          {waiting > 0 && (
            <button
              type="button"
              className="bq-btn bq-btn-soft bq-btn-lg bq-press bq-rev-rec"
              onClick={() => setSheet({ t: "record" })}
            >
              {I.plus(22)} سجّل دفعة
            </button>
          )}
          {waiting === 0 && (
            <div className="bq-rev-empty">
              <p className="bq-rev-empty-t">{I.check(24)} لا دفعات تنتظر</p>
              <p className="bq-hint">عندما يرسل عضو صورة تحويل تظهر هنا، ويصلك إشعار.</p>
              <div className="bq-btn-col">
                <button
                  type="button"
                  className="bq-btn bq-btn-primary bq-btn-lg bq-press"
                  onClick={() => setSheet({ t: "record" })}
                >
                  {I.plus(22)} سجّل دفعة نقدًا أو تحويلًا
                </button>
                <button
                  type="button"
                  className="bq-btn bq-btn-soft bq-press"
                  onClick={() => setTab("work")}
                >
                  الأعمال الأخرى
                </button>
              </div>
            </div>
          )}
        </section>
      ) : (
        <section className="bq-sec" aria-label="الأعمال">
          <div className="bq-tiles">
            <button
              type="button"
              className="bq-tile is-main bq-press"
              onClick={() => setSheet({ t: "record" })}
            >
              {I.plus(24)} سجّل دفعة
            </button>
            <Link href="/committee/late" className="bq-tile bq-press" transitionTypes={["tab-fwd"]}>
              {I.clock(24)}
              <span>
                ذكّر المتأخرين <Num className="bq-group-n">{lateCount}</Num>
              </span>
            </Link>
            <Link
              href="/committee/expenses"
              className="bq-tile bq-press"
              transitionTypes={["tab-fwd"]}
            >
              {I.bag(24)} سجّل مصروفًا
            </Link>
            <Link
              href="/committee/payments"
              className="bq-tile bq-press"
              transitionTypes={["tab-fwd"]}
            >
              {I.coins(24)} الدفعات الأخيرة
            </Link>
          </div>
          <details className="bq-more">
            <summary>
              المزيد <span className="bq-group-i">{I.chev(20)}</span>
            </summary>
            <ul className="bq-list bq-menu">
              {canManage && (
                <MenuRow
                  href="/committee/members"
                  icon={I.people(22)}
                  title="الأعضاء"
                  sub="إضافة عضو، تعديل رقم الهاتف أو الحالة"
                  count={memberCount}
                />
              )}
              <MenuRow
                href="/committee/member-links"
                icon={I.copy(22)}
                title="روابط الأعضاء"
                sub="أرسل لكل عضو رابطه الخاص في واتساب"
              />
              {canManage && (
                <MenuRow
                  href="/committee/campaigns"
                  icon={I.heart(22)}
                  title="حملات التبرع"
                  sub={
                    openCamps
                      ? `${openCamps === 1 ? "حملة مفتوحة" : `${openCamps} حملات مفتوحة`}`
                      : "لا توجد حملة مفتوحة"
                  }
                />
              )}
              <MenuRow
                href="/report#share"
                icon={I.image(22)}
                title="مشاركة التقرير"
                sub="صور أو PDF لمجموعة الواتساب"
              />
              <li>
                <InstallEntry />
              </li>
              <MenuRow
                href="/committee/account"
                icon={I.people(22)}
                title="حسابي"
                sub="اسمك، كلمة السر، عضويتك، الإشعارات"
              />
              <MenuRow
                href="/committee/settings"
                icon={I.lock(22)}
                title="الإعدادات"
                sub="أرقام الصندوق، كلمة السر، الخروج"
              />
            </ul>
          </details>
        </section>
      )}



      {sheet?.t === "record" && (
        <Sheet key="record" label="سجّل دفعة" onDone={() => setSheet(null)}>
          <RecordBody
            members={members}
            ctx={ctx}
            accounts={accounts}
            campaigns={campaigns}
            me={me}
            onDone={(t) => {
              setSheet(null);
              setFirstBefore(newest);
              say(t);
            }}
          />
        </Sheet>
      )}
      {sheet?.t === "receipt" && (
        <Sheet key="receipt" label="وصل استلام" onDone={() => setSheet(null)}>
          <div className="bq-rc-sheet">
            <Receipt r={sheet.r} audience="committee" />
            {sheet.r.status.kind === "confirmed" && <ShareBtns r={sheet.r} />}
          </div>
        </Sheet>
      )}
    </>
  );
}

/* ═══════════════════════════ sub-pages ═══════════════════════════ */
export function LatePage({
  arrears,
  accounts,
  whatsapp,
}: {
  arrears: Arrear[];
  accounts: FundAccount[];
  whatsapp: string | null;
}) {
  return (
    <>
      <SubHead title="تذكير المتأخرين" />
      <section className="bq-sec bq-sec-first">
        <LateList arrears={arrears} ctx={{ accounts, whatsappContact: whatsapp }} />
      </section>
    </>
  );
}

export function ExpensesPage({
  expenses: server,
  campaigns: serverCampaigns,
  balance,
}: {
  expenses: ExpenseAdmin[];
  campaigns: CampaignProgress[];
  /** main fund balance now (an expense above it gets a second look) */
  balance?: number;
}) {
  const demo = useDemoState();
  const expenses = [...demo.expenses, ...server];
  const campaigns = [...demo.campaigns, ...serverCampaigns];
  const say = useSnack();
  const [open, setOpen] = useState(false);
  return (
    <>
      <SubHead title="المصاريف" />
      <section className="bq-sec bq-sec-first">
        <button
          type="button"
          className="bq-btn bq-btn-primary bq-btn-lg bq-press"
          onClick={() => setOpen(true)}
        >
          {I.plus(20)} سجّل مصروفًا
        </button>
        <h2 className="bq-h3">آخر المصاريف</h2>
        <ExpenseAdminList items={expenses} onSay={say} />
      </section>
      {open && (
        <Sheet key="expense" label="سجّل مصروفًا" onDone={() => setOpen(false)}>
          <RecordExpenseBody
            campaigns={campaigns}
            balance={balance}
            onDone={(t) => {
              setOpen(false);
              say(t);
            }}
          />
        </Sheet>
      )}
    </>
  );
}

export function MembersPage({
  members,
  prices,
  thisMonth,
  admin = false,
  credit = {},
  links = {},
  months,
  monthsCtx,
}: {
  members: MemberAdmin[];
  prices: Record<string, number>;
  links?: Record<string, MemberLinkInfo>;
  months?: Record<string, string>;
  monthsCtx?: { year: number; dueMonth: number };
  /** admin: may undo the last change and correct the join month */
  admin?: boolean;
  credit?: Record<string, MemberCredit>;
  thisMonth: string;
}) {
  return (
    <>
      <SubHead title="الأعضاء" />
      <Link
        href="/committee/member-links"
        className="bq-link bq-link-s bq-press"
        transitionTypes={["tab-fwd"]}
      >
        {I.wa(18)} روابط الأعضاء: أرسل لكل عضو رابطه
      </Link>
      <section className="bq-sec bq-sec-first">
        <MembersAdmin
          members={members}
          prices={prices}
          thisMonth={thisMonth}
          admin={admin}
          credit={credit}
          links={links}
          months={months}
          monthsCtx={monthsCtx}
        />
      </section>
    </>
  );
}

export function CampaignsPage({
  campaigns: server,
  pending: serverPending,
}: {
  campaigns: CampaignProgress[];
  /** pending payments: a campaign with pending contributions is not closed yet */
  pending: PendingPayment[];
}) {
  const demo = useDemoState();
  const pending = [...serverPending, ...demo.pending];
  const campaigns = [...demo.campaigns, ...server].map((c) => ({
    ...c,
    ...demo.campaignPatch[c.campaignId],
  }));
  const say = useSnack();
  const [sheet, setSheet] = useState<{ c?: CampaignProgress } | null>(null);
  const done = (t: string) => {
    setSheet(null);
    say(t);
  };
  return (
    <>
      <SubHead title="حملات التبرع" lead="المساهمات تُحسب منفصلة عن الرسوم الشهرية." />
      <section className="bq-sec bq-sec-first">
        <button
          type="button"
          className="bq-btn bq-btn-primary bq-btn-lg bq-press"
          onClick={() => setSheet({})}
        >
          {I.plus(20)} حملة جديدة
        </button>
        <h2 className="bq-h3">الحملات</h2>
        <CampaignAdminList campaigns={campaigns} onEdit={(c) => setSheet({ c })} />
      </section>
      {sheet && (
        <Sheet
          key={sheet.c?.campaignId ?? "new"}
          label={sheet.c ? "الحملة" : "حملة جديدة"}
          onDone={() => setSheet(null)}
        >
          <CampaignFormBody
            campaign={sheet.c}
            pendingCount={sheet.c ? pendingForCampaign(pending, sheet.c.campaignId) : 0}
            onDone={done}
          />
        </Sheet>
      )}
    </>
  );
}

