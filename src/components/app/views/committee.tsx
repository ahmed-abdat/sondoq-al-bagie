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
import { EmptyState } from "../bits";
import { CampaignAdminList, CampaignFormBody } from "../campaign-form";
import { ShareBtns } from "../entries";
import { ExpenseAdminList, RecordExpenseBody } from "../expense";
import { I } from "../icons";
import type { MemberCtx } from "../member";
import { MembersAdmin } from "../members-admin";
import { Num } from "../num";
import { Receipt } from "../receipt";
import type { ReceiptView } from "../receipt-model";
import { PushSuggest } from "../push-suggest";
import { RecordBody } from "../record";
import { LateList } from "../reminders";
import { Sheet } from "../sheet";
import { useSnack } from "../shell";
import { setPendingCount } from "../pending-count";
import { PendingSlip } from "../slip";

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
  if (fresh.length) setSeen([...seen, ...fresh]);
  const [decided, setDecided] = useState<Set<string>>(new Set());
  const waiting = pending.filter((p) => !decided.has(p.id)).length;
  useEffect(() => setPendingCount(waiting), [waiting]);
  const [sheet, setSheet] = useState<{ t: "record" } | { t: "receipt"; r: ReceiptView } | null>(
    null,
  );
  const openCamps = campaigns.filter((c) => c.status === "open").length;

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
      <section className="bq-sec bq-sec-first" aria-labelledby="bq-wait-h">
        <h2 id="bq-wait-h" className="bq-h-count">
          بانتظار التأكيد <Num className="bq-com-n">{waiting}</Num>
        </h2>
        {seen.length > 0 && (
          <ul className="bq-queue">
            {seen.map((p) => (
              <li key={p.id}>
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
                />
              </li>
            ))}
          </ul>
        )}
        {waiting === 0 && (
          <EmptyState
            icon={I.check(22)}
            title="لا توجد دفعات تنتظر التأكيد"
            hint="عندما يصلك تحويل، اضغط «سجّل دفعة» في الأسفل."
          />
        )}
      </section>

      <section className="bq-sec" aria-labelledby="bq-more-h">
        <h2 id="bq-more-h">أعمال أخرى</h2>
        <ul className="bq-list bq-menu">
          <MenuRow
            href="/committee/payments"
            icon={I.coins(22)}
            title="الدفعات الأخيرة"
            sub="وصل كل دفعة، وإلغاء دفعة سُجّلت خطأً"
          />
          <MenuRow
            href="/committee/late"
            icon={I.wa(22)}
            title="تذكير المتأخرين"
            sub="رسالة واتساب لكل متأخر أو للمجموعة"
            count={lateCount}
          />
          <MenuRow
            href="/committee/expenses"
            icon={I.bag(22)}
            title="المصاريف"
            sub="سجّل ما صُرف من الصندوق"
          />
          {canManage && (
            <MenuRow
              href="/committee/members"
              icon={I.people(22)}
              title="الأعضاء"
              sub="إضافة عضو، تعديل رقم الهاتف أو الحالة"
              count={memberCount}
            />
          )}
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
            icon={I.wa(22)}
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
      </section>

      {!sheet && (
        <button type="button" className="bq-fab bq-press" onClick={() => setSheet({ t: "record" })}>
          <span className="bq-fab-l">سجّل دفعة</span>
          {I.plus(26)}
        </button>
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
      <SubHead
        title="تذكير المتأخرين"
        lead="اضغط زر واتساب بجانب الاسم لترسل له تذكيرًا بأشهره ومبلغه."
      />
      <section className="bq-sec bq-sec-first">
        <LateList arrears={arrears} ctx={{ accounts, whatsappContact: whatsapp }} />
      </section>
    </>
  );
}

export function ExpensesPage({
  expenses: server,
  campaigns: serverCampaigns,
}: {
  expenses: ExpenseAdmin[];
  campaigns: CampaignProgress[];
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
}: {
  members: MemberAdmin[];
  prices: Record<string, number>;
  thisMonth: string;
}) {
  return (
    <>
      <SubHead title="الأعضاء" />
      <section className="bq-sec bq-sec-first">
        <MembersAdmin members={members} prices={prices} thisMonth={thisMonth} />
      </section>
    </>
  );
}

export function CampaignsPage({ campaigns: server }: { campaigns: CampaignProgress[] }) {
  const demo = useDemoState();
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
          <CampaignFormBody campaign={sheet.c} onDone={done} />
        </Sheet>
      )}
    </>
  );
}
