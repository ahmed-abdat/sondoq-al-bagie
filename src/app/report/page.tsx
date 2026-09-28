import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ASSOC,
  categoryLabel,
  currentDueMonth,
  dayDate,
  dayWords,
  fmt,
  groupLabel,
  isGone,
  memberCode,
  MONTHS,
  statusLabel,
} from "@/components/app/derive";
import { ReportTools } from "@/components/app/report-tools";
import * as src from "@/components/app/source";

export const metadata: Metadata = { title: "تقرير الصندوق · صندوق الشباب" };

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
  const year = src.thisYear();
  const today = src.today();
  const [summary, info, monthly, members, months, expenses, campaigns, terms] = await Promise.all([
    src.fundSummary(),
    src.fundInfo(),
    src.monthly(year),
    src.members(),
    src.memberMonths(year),
    src.expenses(),
    src.campaigns(),
    src.terms(),
  ]);
  const due = currentDueMonth(today, info.graceDays);
  const shown = members.filter((m) => !isGone(m.status));
  const byMember = new Map<string, Map<number, string>>();
  for (const x of months) {
    const row = byMember.get(x.memberId) ?? new Map<number, string>();
    row.set(x.month, x.state);
    byMember.set(x.memberId, row);
  }
  const payers = (k: number) => months.filter((x) => x.month === k && x.state === "paid").length;
  const lists = [...new Set(shown.map((m) => m.listCode))].sort();
  const month = today.getUTCMonth() + 1;
  const active = shown.filter((m) => m.status === "active");
  const paidNow = active.filter((m) => byMember.get(m.memberId)?.get(month) === "paid").length;
  const current = terms.find((t) => !t.endedOn);
  const termLabel = summary.termNumber ? `الدورة ${summary.termNumber}` : null;
  const yearExpenses = expenses.filter((e) => e.spentOn.startsWith(String(year)));

  return (
    <main className="rp">
      <ReportTools
        data={{
          termLabel,
          year,
          balance: summary.balance,
          collectedThisYear: summary.collectedThisYear,
          spentThisYear: summary.spentThisYear,
          paidCount: paidNow,
          activeCount: active.length,
          month,
          months: monthly.map((m) => ({
            month: m.month,
            expected: m.expected,
            collected: m.collected,
          })),
          asOfLabel: dayDate(today),
        }}
      />
      <Link href="/accounts" className="bq-link bq-link-s bq-press rp-back">
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
            {current
              ? ` (منذ ${dayWords(current.startedOn)} ${current.startedOn.slice(0, 4)})`
              : ""}{" "}
            · حتى {dayDate(today)}
          </p>
          <p className="rp-sub">{ASSOC}</p>
        </div>
      </header>

      <section className="rp-sec">
        <h2>الملخّص</h2>
        <table className="rp-sum">
          <tbody>
            <tr>
              <th>رصيد مُرحَّل من السنوات السابقة</th>
              <td>
                <Num>{fmt(summary.openingBalance)}</Num>
              </td>
            </tr>
            <tr>
              <th>+ جُمع من الرسوم الشهرية</th>
              <td>
                <Num>{fmt(summary.moneyIn)}</Num>
              </td>
            </tr>
            {summary.transfersIn > 0 && (
              <tr>
                <th>+ حُوّل من الحملات</th>
                <td>
                  <Num>{fmt(summary.transfersIn)}</Num>
                </td>
              </tr>
            )}
            <tr>
              <th>− صُرف على الأنشطة</th>
              <td>
                <Num>{fmt(summary.moneyOut)}</Num>
              </td>
            </tr>
            {summary.adjustments !== 0 && (
              <tr>
                <th>{summary.adjustments > 0 ? "+" : "−"} فرق عند التسليم</th>
                <td>
                  <Num>{fmt(Math.abs(summary.adjustments))}</Num>
                </td>
              </tr>
            )}
            <tr className="is-total">
              <th>= في الصندوق الآن</th>
              <td>
                <Num>{fmt(summary.balance)}</Num> أوقية
              </td>
            </tr>
          </tbody>
        </table>
        <p className="rp-note">
          <Num>{paidNow}</Num> من <Num>{active.length}</Num> عضوًا دفعوا رسوم {MONTHS[month - 1]}.
          المبالغ بالأوقية القديمة.
        </p>
      </section>

      <section className="rp-sec">
        <h2>ما جُمع كل شهر</h2>
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
      </section>

      <section className="rp-sec rp-break">
        <h2>الأعضاء والأشهر</h2>
        <p className="rp-note">
          <span className="rp-c is-paid">✓</span> مدفوع · <span className="rp-c is-ahead">✓</span>{" "}
          مدفوع مقدَّمًا · <span className="rp-c is-late" /> غير مدفوع ·{" "}
          <span className="rp-c is-off">–</span> غير مستحق
        </p>
        {lists.map((l) => (
          <table key={l} className="rp-table rp-grid">
            <caption>المجموعة {groupLabel(l)}</caption>
            <thead>
              <tr>
                <th>رقم</th>
                <th className="rp-name">الاسم</th>
                {MONTHS.map((n, i) => (
                  <th key={n} className="rp-m" title={n}>
                    <Num>{i + 1}</Num>
                  </th>
                ))}
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {shown
                .filter((m) => m.listCode === l)
                .sort((a, b) => a.number - b.number)
                .map((m) => {
                  const row = byMember.get(m.memberId);
                  return (
                    <tr key={m.memberId}>
                      <td>
                        <Num>{memberCode(m)}</Num>
                      </td>
                      <td className="rp-name">{m.fullName}</td>
                      {MONTHS.map((_, i) => {
                        const st = row?.get(i + 1);
                        const cls =
                          st === "paid"
                            ? i + 1 > due
                              ? "is-ahead"
                              : "is-paid"
                            : st === "late"
                              ? "is-late"
                              : st === "not_owed"
                                ? "is-off"
                                : "";
                        return (
                          <td key={i} className={`rp-m ${cls}`}>
                            {st === "paid" ? "✓" : st === "not_owed" ? "–" : ""}
                          </td>
                        );
                      })}
                      <td className="rp-st">{statusLabel(m, due)}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        ))}
      </section>

      <section className="rp-sec">
        <h2>المصاريف</h2>
        {yearExpenses.length ? (
          <table className="rp-table">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th className="rp-name">البيان</th>
                <th>النشاط</th>
                <th>المبلغ</th>
              </tr>
            </thead>
            <tbody>
              {yearExpenses.map((e) => (
                <tr key={e.id}>
                  <td>{dayWords(e.spentOn)}</td>
                  <td className="rp-name">{e.note ?? categoryLabel(e.category)}</td>
                  <td>{categoryLabel(e.category)}</td>
                  <td>
                    <Num>{fmt(e.amount)}</Num>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="rp-note">لم يُصرف شيء هذا العام.</p>
        )}
      </section>

      {campaigns.length > 0 && (
        <section className="rp-sec">
          <h2>حملات التبرع</h2>
          <table className="rp-table">
            <thead>
              <tr>
                <th className="rp-name">الحملة</th>
                <th>الهدف</th>
                <th>ما جُمع</th>
                <th>ما صُرف</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.campaignId}>
                  <td className="rp-name">{c.title}</td>
                  <td>{c.targetAmount ? <Num>{fmt(c.targetAmount)}</Num> : "—"}</td>
                  <td>
                    <Num>{fmt(c.collected)}</Num>
                  </td>
                  <td>
                    <Num>{fmt(c.spent)}</Num>
                  </td>
                  <td>{c.status === "open" ? "مفتوحة" : "مغلقة"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <footer className="rp-foot">
        صندوق الشباب · رابط التحقق: <ReportLink />
      </footer>
    </main>
  );
}

function ReportLink() {
  const site =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "");
  return (
    <bdi dir="ltr" className="bq-num">
      {site ? `${site.replace(/\/$/, "")}/report` : "/report"}
    </bdi>
  );
}
