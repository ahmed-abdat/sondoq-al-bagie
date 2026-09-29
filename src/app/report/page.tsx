import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ASSOC,
  dayDate,
  dayWords,
  fmt,
  groupLabel,
  isEmptyClosedCampaign,
  isGone,
  MONTHS,
} from "@/components/app/derive";
import { MemberNo } from "@/components/app/bits";
import { Collapsible } from "@/components/app/collapsible";
import { Engaged } from "@/components/app/engaged";
import { SITE_URL } from "@/components/app/site";
import { ReportShare } from "@/components/app/report-share";
import * as src from "@/components/app/source";
import { monthPaid, paidTotal } from "@/lib/report-check";

export const metadata: Metadata = {
  title: "تقرير الصندوق · صندوق الرابطة",
  description: "ما في الصندوق الآن، وما جُمع كل شهر، ومن دفع من الأعضاء، والمصاريف والحملات.",
  openGraph: {
    title: "تقرير صندوق رابطة شباب البقيع",
    description: "ما في الصندوق الآن، ومن دفع رسوم هذا الشهر. افتح التقرير الكامل.",
    type: "article",
    locale: "ar_MR",
    siteName: "صندوق الرابطة",
  },
};

const Num = ({ children }: { children: React.ReactNode }) => (
  <bdi dir="ltr" className="bq-num">
    {children}
  </bdi>
);

/**
 * The fund's full public report, ready to print on A4 (or save as PDF) and to share in the
 * WhatsApp group. TODO(lane-a): read everything from getReport() when it lands.
 */
export default async function ReportPage() {
  const r = await src.report();
  const { year, summary } = r;
  const today = new Date(r.generatedAt);
  // left / deceased are hidden, as on the public lists
  const shown = r.members.filter((m) => !isGone(m.status));
  const listOf = (m: { memberRef: string }) => m.memberRef.split("-")[0];
  const lists = [...new Set(shown.map(listOf))].sort();
  const month = today.getUTCMonth() + 1;
  const active = shown.filter((m) => m.status === "active");
  const paidNow = active.filter((m) => monthPaid(m.months[month - 1])).length;
  const payers = (k: number) => shown.filter((m) => monthPaid(m.months[k - 1])).length;
  const current = r.term;
  const termLabel = summary.termNumber ? `الدورة ${summary.termNumber}` : null;
  const monthly = r.monthly;
  const yearExpenses = r.expenses;
  const campaigns = r.campaigns.filter((c) => !isEmptyClosedCampaign(c));

  const cards: { k: string; v: number; sign?: string }[] = [
    { k: "رصيد سابق", v: summary.openingBalance },
    { k: "جُمع من الرسوم", v: summary.moneyIn, sign: "+" },
    ...(summary.transfersIn > 0 ? [{ k: "من الحملات", v: summary.transfersIn, sign: "+" }] : []),
    { k: "صُرف", v: summary.moneyOut, sign: "−" },
    ...(summary.adjustments !== 0
      ? [
          {
            k: "فرق عند التسليم",
            v: Math.abs(summary.adjustments),
            sign: summary.adjustments > 0 ? "+" : "−",
          },
        ]
      : []),
  ];

  return (
    <main className="rp">
      <Engaged />
      <Link href="/accounts" className="bq-link bq-link-s bq-press bq-back rp-back">
        رجوع إلى الحسابات
      </Link>

      <header className="rp-head">
        <span className="rp-logo">
          <Image src="/logo.jpg" alt="" width={64} height={64} priority />
        </span>
        <div>
          <h1>تقرير صندوق رابطة شباب البقيع</h1>
          <p>
            سنة <Num>{year}</Num>
            {termLabel ? ` · ${termLabel}` : ""}
            {current ? ` منذ ${dayWords(current.startedOn)} ${current.startedOn.slice(0, 4)}` : ""}
          </p>
          <p className="rp-sub">حتى {dayDate(today)}</p>
        </div>
      </header>

      <ReportShare data={r} />

      <section className="rp-sec" aria-label="الملخّص">
        <div className="rp-now">
          <span>في الصندوق الآن</span>
          <strong>
            <Num>{fmt(summary.balance)}</Num> <small>أوقية</small>
          </strong>
          <span>
            <Num>{paidNow}</Num> من <Num>{active.length}</Num> عضوًا دفعوا رسوم {MONTHS[month - 1]}
          </span>
        </div>
        <ul className="rp-cards">
          {cards.map((c) => (
            <li key={c.k}>
              <span>{c.k}</span>
              <strong>
                <Num>{`${c.sign ?? ""}${fmt(c.v)}`}</Num>
              </strong>
            </li>
          ))}
        </ul>
        <p className="rp-note">المبالغ بالأوقية القديمة. تبرعات الحملات في حسابها الخاص.</p>
      </section>

      <Collapsible title="ما جُمع كل شهر" open>
        <table className="rp-table">
          <thead>
            <tr>
              <th>الشهر</th>
              <th>المتوقَّع</th>
              <th>ما جُمع</th>
              <th>من دفع</th>
            </tr>
          </thead>
          <tbody>
            {MONTHS.map((name, i) => {
              const m = monthly.find((x) => x.month === i + 1);
              return (
                <tr key={name}>
                  <td>{name}</td>
                  <td>
                    <Num>{fmt(m?.expected ?? 0)}</Num>
                  </td>
                  <td>
                    <Num>{fmt(m?.collected ?? 0)}</Num>
                  </td>
                  <td>
                    <Num>{payers(i + 1)}</Num>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Collapsible>

      <p className="rp-note rp-legend">
        <span>
          <OkMark /> مدفوع · خانة فارغة: لم يُدفع
        </span>
        <span>
          1 = {MONTHS[0]} … 12 = {MONTHS[11]}
        </span>
      </p>
      {lists.map((l) => {
        const rows = shown.filter((m) => listOf(m) === l);
        return (
          <Collapsible key={l} title={`المجموعة ${groupLabel(l)}`} count={rows.length}>
            {/* like the paper sheet (r22): bordered month cells, a ✓ when paid, empty otherwise */}
            <div className="rp-mhead" aria-hidden="true">
              <span className="rp-cells">
                {MONTHS.map((_, i) => (
                  <span key={i}>{i + 1}</span>
                ))}
              </span>
            </div>
            <ul className="rp-members">
              {rows.map((m) => {
                const paid = m.months.flatMap((st, i) => (monthPaid(st) ? [MONTHS[i]] : []));
                return (
                  <li key={m.memberId}>
                    <span className="rp-ref">
                      <MemberNo m={m} scoped />
                    </span>
                    <span className="rp-mname">{m.fullName}</span>
                    {r.showAmountOwed && m.amountOwed ? (
                      <span className="rp-mst">
                        عليه حتى الآن <Num>{fmt(m.amountOwed)}</Num> أوقية
                      </span>
                    ) : null}
                    <span
                      className="rp-cells"
                      role="img"
                      aria-label={paid.length ? `مدفوع: ${paid.join("، ")}` : "لا أشهر مدفوعة"}
                    >
                      {m.months.map((st, i) => (
                        <span key={i}>{monthPaid(st) ? <OkMark /> : null}</span>
                      ))}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="rp-gtotal">
              المجموع: <Num>{fmt(paidTotal(rows, r.groupPrices))}</Num> أوقية
            </p>
          </Collapsible>
        );
      })}

      {yearExpenses.length > 0 && (
        <Collapsible
          title={`المصاريف${!r.expensesComplete ? " (آخر 50)" : ""}`}
          count={yearExpenses.length}
        >
          <table className="rp-table">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th className="rp-name">البيان</th>
                <th>المبلغ</th>
              </tr>
            </thead>
            <tbody>
              {yearExpenses.map((e, i) => (
                <tr key={`${e.spentOn}-${i}`}>
                  <td>{dayWords(e.spentOn)}</td>
                  <td className="rp-name">
                    {e.note ?? e.categoryLabel}
                    {e.note ? <span className="rp-cat"> · {e.categoryLabel}</span> : null}
                  </td>
                  <td>
                    <Num>{fmt(e.amount)}</Num>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Collapsible>
      )}

      {campaigns.length > 0 && (
        <Collapsible title="حملات التبرع" count={campaigns.length}>
          <ul className="rp-cards rp-camps">
            {campaigns.map((c) => (
              <li key={c.campaignId}>
                <span>
                  {c.title} · {c.status === "open" ? "مفتوحة" : "مغلقة"}
                </span>
                <strong>
                  <Num>{fmt(c.collected)}</Num>
                </strong>
                <span>
                  {c.targetAmount ? (
                    <>
                      من هدف <Num>{fmt(c.targetAmount)}</Num>.{" "}
                    </>
                  ) : null}
                  صُرف <Num>{fmt(c.spent)}</Num>
                </span>
              </li>
            ))}
          </ul>
        </Collapsible>
      )}

      <footer className="rp-foot">
        صندوق الرابطة · {ASSOC} · رابط التحقق: <ReportLink />
      </footer>
    </main>
  );
}

/** A paid month: a green disc with a white check, as on the shared images. */
function OkMark() {
  return (
    <svg className="rp-okm" viewBox="0 0 32 32" width="18" height="18" aria-hidden="true">
      <circle cx="16" cy="16" r="16" fill="var(--g7)" />
      <path
        d="M9 16l5 5 10-11"
        fill="none"
        stroke="#fff"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ReportLink() {
  const site = SITE_URL;
  return (
    <bdi dir="ltr" className="bq-num">
      {site ? `${site.replace(/\/$/, "")}/report` : "/report"}
    </bdi>
  );
}
