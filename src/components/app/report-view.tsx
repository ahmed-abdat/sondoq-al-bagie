"use client";
// /report: the static shell (grid, counts, fees) is the same for everyone; the money (summary,
// monthly amounts, totals, owed, expenses, campaigns) arrives in the browser only for the
// committee or a member with their link (money privacy). Strangers see «•••».
import Image from "next/image";
import Link from "next/link";
import type { ReportData, ReportShell } from "@/lib/data/types";
import { monthPaid, paidTotal } from "@/lib/report-check";
import { PaidCheck } from "./bits";
import { Collapsible } from "./collapsible";
import {
  ASSOC,
  dayDate,
  dayWords,
  fmt,
  groupLabel,
  isEmptyClosedCampaign,
  isGone,
  MONTHS,
} from "./derive";
import { Engaged } from "./engaged";
import { Amount, Dots, MoneyHint, useReportMoney } from "./money";
import { ReportShare } from "./report-share";
import { SITE_URL } from "./site";

const Num = ({ children }: { children: React.ReactNode }) => (
  <bdi dir="ltr" className="bq-num">
    {children}
  </bdi>
);

/** The fund's report, ready to print on A4 (or save as PDF); the committee shares it. */
export function ReportView({ shell }: { shell: ReportShell }) {
  const r: ReportData | null | undefined = useReportMoney();
  const full = r ?? null;
  const { year } = shell;
  const summary = full?.summary ?? null;
  const today = new Date(shell.generatedAt);
  const owedOf = new Map(
    full?.showAmountOwed ? full.members.map((m) => [m.memberId, m.amountOwed ?? 0]) : [],
  );
  // left / deceased are hidden, as on the public lists
  const shown = shell.members.filter((m) => !isGone(m.status));
  const listOf = (m: { memberRef: string }) => m.memberRef.split("-")[0];
  const lists = [...new Set(shown.map(listOf))].sort();
  const month = today.getUTCMonth() + 1;
  const active = shown.filter((m) => m.status === "active");
  const paidNow = active.filter((m) => monthPaid(m.months[month - 1])).length;
  const payers = (k: number) => shown.filter((m) => monthPaid(m.months[k - 1])).length;
  const current = shell.term;
  const monthly = full?.monthly ?? [];
  const yearExpenses: {
    spentOn: string;
    note: string | null;
    categoryLabel: string;
    amount?: number;
  }[] = full?.expenses ?? shell.expenses;
  const campaigns: {
    campaignId: string;
    title: string;
    status: string;
    collected?: number;
    spent?: number;
    targetAmount?: number | null;
  }[] = full ? full.campaigns.filter((c) => !isEmptyClosedCampaign(c)) : shell.campaigns;

  const cards: { k: string; v: number | null; sign?: string }[] = !summary
    ? [
        { k: "رصيد سابق", v: null },
        { k: "جُمع من الرسوم", v: null },
        { k: "صُرف", v: null },
      ]
    : [
        { k: "رصيد سابق", v: summary.openingBalance },
        { k: "جُمع من الرسوم", v: summary.moneyIn, sign: "+" },
        ...(summary.transfersIn > 0
          ? [{ k: "من الحملات", v: summary.transfersIn, sign: "+" }]
          : []),
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
            {current
              ? ` · منذ ${dayWords(current.startedOn)} ${current.startedOn.slice(0, 4)}`
              : ""}
          </p>
          <p className="rp-sub">حتى {dayDate(today)}</p>
        </div>
      </header>

      <ReportShare data={full} />

      <section className="rp-sec" aria-label="الملخّص">
        <div className="rp-now">
          <span>في الصندوق الآن</span>
          <strong>
            {summary ? <Num>{fmt(summary.balance)}</Num> : <Dots />} <small>أوقية</small>
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
                <Amount v={c.v} sign={c.sign} />
              </strong>
            </li>
          ))}
        </ul>
        <p className="rp-note">المبالغ بالأوقية القديمة. تبرعات الحملات في حسابها الخاص.</p>
        <MoneyHint />
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
                  <td>
                    {name}
                    {/* a future month with money in it was paid ahead (audit V10) */}
                    {i + 1 > month && (m?.collected ?? 0) > 0 ? (
                      <span className="rp-cat"> (مدفوع مقدَّمًا)</span>
                    ) : null}
                  </td>
                  <td>
                    <Amount v={full ? (m?.expected ?? 0) : null} />
                  </td>
                  <td>
                    <Amount v={full ? (m?.collected ?? 0) : null} />
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
          <PaidCheck /> مدفوع · خانة فارغة: لم يُدفع
        </span>
        <span>
          1 = {MONTHS[0]} … 12 = {MONTHS[11]}
        </span>
      </p>
      {lists.map((l) => {
        const rows = shown.filter((m) => listOf(m) === l);
        return (
          <Collapsible key={l} title={`المجموعة ${groupLabel(l)}`} count={rows.length}>
            {/* variant A (r25): ≥600px one bordered table, a line per member; on a phone the
                same table, each member a name row with its 12 cells beneath */}
            <MembersTable
              rows={rows.map((m) => ({
                id: m.memberId,
                name: m.fullName,
                owed: owedOf.get(m.memberId) ?? 0,
                paid: m.months.map(monthPaid),
              }))}
            />
            <p className="rp-gtotal">
              المجموع: <Amount v={full ? paidTotal(rows, shell.groupPrices) : null} /> أوقية
            </p>
          </Collapsible>
        );
      })}

      {yearExpenses.length > 0 && (
        <Collapsible
          title={`المصاريف${!shell.expensesComplete ? " (آخر 50)" : ""}`}
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
                    <Amount v={e.amount} />
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
                  <Amount v={c.collected} />
                </strong>
                <span>
                  {c.targetAmount ? (
                    <>
                      من هدف <Num>{fmt(c.targetAmount)}</Num>.{" "}
                    </>
                  ) : null}
                  صُرف <Amount v={c.spent} />
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

const M12 = Array.from({ length: 12 }, (_, i) => i + 1);

type GridRow = { id: string; name: string; owed: number; paid: boolean[] };

const Owed = ({ n }: { n: number }) =>
  n ? (
    <span className="rp-owed">
      عليه حتى الآن <Num>{fmt(n)}</Num> أوقية
    </span>
  ) : null;

const paidLabel = (paid: boolean[]) => {
  const p = paid.flatMap((x, i) => (x ? [MONTHS[i]] : []));
  return p.length ? `مدفوع: ${p.join("، ")}` : "لا أشهر مدفوعة";
};

/**
 * The members' months like the paper sheet: white bordered cells, a green ✓ when paid, empty
 * otherwise. Two tables, one shown by width (CSS): wide «الاسم | 1 … 12», narrow name rows.
 */
function MembersTable({ rows }: { rows: GridRow[] }) {
  return (
    <>
      <table className="rp-mt rp-mt-wide">
        <thead>
          <tr>
            <th className="rp-mt-name">الاسم</th>
            {M12.map((n) => (
              <th key={n}>{n}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id} aria-label={`${m.name}: ${paidLabel(m.paid)}`}>
              <td className="rp-mt-name">
                {m.name}
                <Owed n={m.owed} />
              </td>
              {m.paid.map((p, i) => (
                <td key={i} className="rp-mt-c">
                  {p ? <PaidCheck /> : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <table className="rp-mt rp-mt-narrow">
        <thead>
          <tr>
            {M12.map((n) => (
              <th key={n}>{n}</th>
            ))}
          </tr>
        </thead>
        {rows.map((m) => (
          <tbody key={m.id} aria-label={`${m.name}: ${paidLabel(m.paid)}`}>
            <tr className="rp-mt-nrow">
              <td colSpan={12}>
                <span className="rp-mt-nm">{m.name}</span>
                <Owed n={m.owed} />
              </td>
            </tr>
            <tr className="rp-mt-cells">
              {m.paid.map((p, i) => (
                <td key={i} className="rp-mt-c">
                  {p ? <PaidCheck size={16} /> : null}
                </td>
              ))}
            </tr>
          </tbody>
        ))}
      </table>
    </>
  );
}

function ReportLink() {
  const site = SITE_URL;
  return (
    <bdi dir="ltr" className="bq-num rp-url">
      {site ? `${site.replace(/\/$/, "")}/report` : "/report"}
    </bdi>
  );
}
