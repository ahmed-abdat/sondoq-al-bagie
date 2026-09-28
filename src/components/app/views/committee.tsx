"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePaymentsRealtime } from "@/lib/data/realtime";
import type {
  Arrear,
  CampaignProgress,
  ExpenseAdmin,
  FundAccount,
  MemberStatus,
  PendingPayment,
} from "@/lib/data/types";
import { CampaignAdminList, CampaignFormBody, CloseCampaignBody } from "../campaign-form";
import { ExpenseAdminList, RecordExpenseBody } from "../expense";
import { LateList } from "../reminders";
import { Segmented } from "../segmented";
import { EmptyState } from "../bits";
import { ShareBtns } from "../entries";
import { I } from "../icons";
import type { MemberCtx } from "../member";
import { Num } from "../num";
import { Receipt } from "../receipt";
import type { ReceiptView } from "../receipt-model";
import { RecordBody } from "../record";
import { Sheet } from "../sheet";
import { useDemoState } from "../act";
import { LogoutButton } from "../logout";
import { MembersAdmin } from "../members-admin";
import type { MemberAdmin } from "../types";
import { useSnack } from "../shell";
import { PendingSlip } from "../slip";

/** Live updates: another committee member recorded or confirmed a payment → refetch the page. */
export function CommitteeLive() {
  const router = useRouter();
  usePaymentsRealtime(() => router.refresh());
  return null;
}

export function CommitteeView({
  pending: serverPending,
  me,
  members,
  ctx,
  accounts,
  whatsapp,
  arrears,
  expenses: serverExpenses,
  campaigns: serverCampaigns,
  canCampaign,
  membersAdmin,
  thisMonth,
}: {
  pending: PendingPayment[];
  me: { by: string; role: string };
  members: MemberStatus[];
  ctx: MemberCtx;
  accounts: FundAccount[];
  whatsapp: string | null;
  arrears: Arrear[];
  expenses: ExpenseAdmin[];
  campaigns: CampaignProgress[];
  /** admin, treasurer, deputy: campaigns and member management */
  canCampaign: boolean;
  membersAdmin: MemberAdmin[];
  /** "YYYY-MM" */
  thisMonth: string;
}) {
  const [part, setPart] = useState<"pay" | "late" | "exp" | "camp" | "mem">("pay");
  // demo mode: local additions/changes (empty otherwise)
  const demo = useDemoState();
  const pending = [...serverPending, ...demo.pending];
  const expenses = [...demo.expenses, ...serverExpenses];
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
  const [sheet, setSheet] = useState<
    | { t: "record" }
    | { t: "receipt"; r: ReceiptView }
    | { t: "expense" }
    | { t: "campaign"; c?: CampaignProgress }
    | { t: "close"; c: CampaignProgress }
    | null
  >(null);
  const doneSay = (t: string) => {
    setSheet(null);
    say(t);
  };
  const [fabMini, setFabMini] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    const on = () => {
      const y = window.scrollY;
      if (Math.abs(y - last) < 6) return;
      setFabMini(y > last && y > 80);
      last = y;
    };
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  const none = members.filter((m) => m.status === "active" && m.monthsPaidThisYear === 0).length;
  return (
    <>
      <div className="bq-com-bar">
        <span>
          <strong>بانتظار التأكيد</strong> <Num className="bq-com-n">{waiting}</Num>
        </span>
        <span className="bq-com-actions">
          <Link href="/committee/settings" className="bq-link bq-link-s bq-press">
            الإعدادات
          </Link>
          <LogoutButton className="bq-link bq-link-s bq-press">خروج</LogoutButton>
        </span>
      </div>

      <Segmented
        label="أقسام اللجنة"
        value={part}
        onChange={setPart}
        items={[
          {
            k: "pay",
            l: (
              <>
                الدفعات <Num className="bq-seg-n">{waiting}</Num>
              </>
            ),
          },
          {
            k: "late",
            l: (
              <>
                المتأخرون <Num className="bq-seg-n">{arrears.length}</Num>
              </>
            ),
          },
          { k: "exp", l: "المصاريف" },
          ...(canCampaign
            ? [
                { k: "mem" as const, l: "الأعضاء" },
                { k: "camp" as const, l: "الحملات" },
              ]
            : []),
        ]}
      />

      {part === "pay" && (
        <>
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
          {waiting === 0 && (
            <EmptyState
              icon={I.check(22)}
              title="راجعت كل الدفعات"
              hint="ستظهر هنا أي دفعة جديدة يسجّلها المشرفون."
            />
          )}
          <section className="bq-sec" aria-labelledby="bq-follow-h">
            <h2 id="bq-follow-h">للمتابعة</h2>
            <Link
              href="/members?filter=none"
              className="bq-row bq-press"
              transitionTypes={["tab-back"]}
            >
              <span className="bq-disc">{I.people(22)}</span>
              <span className="bq-row-m">
                <span className="bq-row-t">لم يدفعوا أي شهر هذا العام</span>
                <span className="bq-row-s">للمتابعة معهم</span>
              </span>
              <Num className="bq-amt">{none}</Num>
              <span className="bq-chev">{I.go(18)}</span>
            </Link>
            <button type="button" className="bq-row bq-press" onClick={() => setPart("late")}>
              <span className="bq-disc is-in">{I.wa(22)}</span>
              <span className="bq-row-m">
                <span className="bq-row-t">تذكير المتأخرين</span>
                <span className="bq-row-s">واحدًا واحدًا أو في المجموعة</span>
              </span>
              <Num className="bq-amt">{arrears.length}</Num>
              <span className="bq-chev">{I.go(18)}</span>
            </button>
          </section>
        </>
      )}

      {part === "late" && (
        <section className="bq-sec bq-sec-first" aria-label="المتأخرون">
          <LateList arrears={arrears} ctx={{ accounts, whatsappContact: whatsapp }} />
        </section>
      )}

      {part === "exp" && (
        <section className="bq-sec bq-sec-first" aria-label="المصاريف">
          <button
            type="button"
            className="bq-btn bq-btn-primary bq-btn-lg bq-press"
            onClick={() => setSheet({ t: "expense" })}
          >
            {I.plus(20)} سجّل مصروفًا
          </button>
          <h2 className="bq-h3">آخر المصاريف</h2>
          <ExpenseAdminList items={expenses} onSay={say} />
        </section>
      )}

      {part === "mem" && canCampaign && (
        <section className="bq-sec bq-sec-first" aria-label="إدارة الأعضاء">
          <MembersAdmin members={membersAdmin} prices={ctx.prices} thisMonth={thisMonth} />
        </section>
      )}

      {part === "camp" && canCampaign && (
        <section className="bq-sec bq-sec-first" aria-label="الحملات">
          <button
            type="button"
            className="bq-btn bq-btn-primary bq-btn-lg bq-press"
            onClick={() => setSheet({ t: "campaign" })}
          >
            {I.plus(20)} حملة جديدة
          </button>
          <h2 className="bq-h3">الحملات</h2>
          <CampaignAdminList
            campaigns={campaigns}
            onEdit={(c) => setSheet({ t: "campaign", c })}
            onClose={(c) => setSheet({ t: "close", c })}
          />
        </section>
      )}

      {!sheet && part === "pay" && (
        <button
          type="button"
          className={`bq-fab bq-press ${fabMini ? "is-mini" : ""}`}
          onClick={() => setSheet({ t: "record" })}
          aria-label="سجّل دفعة"
        >
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
            onDone={doneSay}
          />
        </Sheet>
      )}
      {sheet?.t === "expense" && (
        <Sheet key="expense" label="سجّل مصروفًا" onDone={() => setSheet(null)}>
          <RecordExpenseBody campaigns={campaigns} onDone={doneSay} />
        </Sheet>
      )}
      {sheet?.t === "campaign" && (
        <Sheet
          key="campaign"
          label={sheet.c ? "تعديل الحملة" : "حملة جديدة"}
          onDone={() => setSheet(null)}
        >
          <CampaignFormBody campaign={sheet.c} onDone={doneSay} />
        </Sheet>
      )}
      {sheet?.t === "close" && (
        <Sheet key="close" label="إغلاق الحملة" onDone={() => setSheet(null)}>
          <CloseCampaignBody campaign={sheet.c} onDone={doneSay} />
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
