"use client";
// Old payments recorded before the committee-only update, still waiting for a confirmation
// (/committee/review, gone once none are left), and the live-update listener.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CloseStalePushNotifications } from "@/components/providers/committee-push";
import { toastFor, usePaymentsRealtime } from "@/lib/data/realtime";
import type { CampaignProgress, PendingPayment } from "@/lib/data/types";
import { useDemoState } from "../act";
import { MethodBadge } from "../bits";
import { fmt, relativeAgo } from "../derive";
import { I } from "../icons";
import { Num, useNow } from "../num";
import { PaymentDetails } from "../cancel-payment";
import type { ReceiptView } from "../receipt-model";
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
        href="/committee/more"
        className="bq-link bq-link-s bq-back bq-press"
        transitionTypes={["tab-back"]}
      >
        {I.back(18)} المزيد
      </Link>
      <h1>{title}</h1>
      {lead && <p className="bq-lead">{lead}</p>}
    </header>
  );
}

/* ═══════════════════════════ hub ═══════════════════════════ */
export function CommitteeView({
  pending: serverPending,
  me,
  campaigns: serverCampaigns,
}: {
  pending: PendingPayment[];
  me: { by: string; role: string; canConfirm?: boolean; memberId?: string | null };
  campaigns: CampaignProgress[];
}) {
  const demo = useDemoState();
  const pending = [...serverPending, ...demo.pending];
  const campaigns = [...demo.campaigns, ...serverCampaigns].map((c) => ({
    ...c,
    ...demo.campaignPatch[c.campaignId],
  }));
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
  const campaignTitles = Object.fromEntries(campaigns.map((c) => [c.campaignId, c.title]));
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
        <Link href="/committee/more" className="bq-link bq-link-s bq-back bq-press">
          {I.back(18)} المزيد
        </Link>
        <h1>دفعات قديمة لم تُثبَّت</h1>
        <p className="bq-lead">سُجّلت قبل التحديث. ثبّت كل دفعة أو ارفضها.</p>
      </header>

      <CloseStalePushNotifications pendingIds={serverPending.map((p) => p.id)} />
      <section className="bq-sec bq-rev-sec" aria-labelledby="bq-wait-h">
        <h2 id="bq-wait-h" className="bq-sr">
          دفعات تحتاج مراجعة <Num>{waiting}</Num>
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
                    campaignTitles={campaignTitles}
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
                        {p.createdByName ? `سجّلها ${p.createdByName}` : "سُجّلت"}
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
        {waiting === 0 && (
          <div className="bq-rev-empty">
            <p className="bq-rev-empty-t">{I.check(24)} لا دفعات قديمة تنتظر</p>
            <Link href="/committee" className="bq-btn bq-btn-soft bq-press">
              إلى الرئيسية
            </Link>
          </div>
        )}
      </section>

      {sheet?.t === "receipt" && (
        <Sheet key="receipt" label="تفاصيل الدفعة" onDone={() => setSheet(null)}>
          <PaymentDetails r={sheet.r} />
        </Sheet>
      )}
    </>
  );
}

/* ═══════════════════════════ sub-pages ═══════════════════════════ */
