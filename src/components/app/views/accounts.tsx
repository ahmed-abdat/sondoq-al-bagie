"use client";
import Link from "next/link";
import { useState } from "react";
import type {
  ExpenseCategory,
  FundAccount,
  FundSummary,
  MonthlyCollection,
  Term,
} from "@/lib/data/types";
import { categoryLabel, dayWords, fmt } from "../derive";
import dynamic from "next/dynamic";
import { EntryRow } from "../entry-row";

// the receipt, its stamp, QR and share code load only when a row is opened
const EntrySheetBody = dynamic(() => import("../entries").then((m) => m.EntrySheetBody), {
  ssr: false,
});
import { I } from "../icons";
import { MonthRail } from "../month-rail";
import { Num, Roll } from "../num";
import { PayTo } from "../pay-to";
import { Segmented } from "../segmented";
import { Sheet, useSheet } from "../sheet";
import type { LedgerEntry } from "../types";

const RAMP = ["var(--g8)", "var(--g7)", "var(--g5)", "var(--n3)"];

export function AccountsView({
  summary,
  accounts,
  monthly,
  payers,
  currentMonth,
  spentBy,
  ledger,
  term,
  pastTerms,
}: {
  summary: FundSummary;
  accounts: FundAccount[];
  monthly: MonthlyCollection[];
  payers: number[];
  currentMonth: number;
  /** this year's spending per category, largest first */
  spentBy: { category: ExpenseCategory; total: number }[];
  ledger: LedgerEntry[];
  /** «الدورة 2 · منذ …» */
  term: string | null;
  pastTerms: Term[];
}) {
  const [f, setF] = useState<"all" | "in" | "out">("all");
  const termYear = monthly[0]?.year ?? new Date().getFullYear();
  const sheet = useSheet<LedgerEntry>();
  const color = Object.fromEntries(spentBy.map((x, i) => [x.category, RAMP[i] ?? "var(--n3)"]));
  const spent = spentBy.reduce((s, x) => s + x.total, 0);
  const shown = ledger.filter(
    (e) => f === "all" || (f === "out" ? e.kind === "expense" : e.kind !== "expense"),
  );
  const expenses = ledger.filter((e) => e.kind === "expense");
  const open = (e: LedgerEntry, el: HTMLElement) => sheet.open(e, e.receipt ? el : null, "bq-rc");
  const s = sheet.state;
  return (
    <>
      <header className="bq-page-h">
        <h1>الحسابات</h1>
        {term && <p className="bq-lead">{term}</p>}
      </header>

      <section
        className="bq-sec bq-sec-first bq-rv"
        id="bq-sum"
        data-rv="acc-sum"
        aria-labelledby="bq-sum-h"
      >
        <h2 id="bq-sum-h">كيف حُسب الرصيد؟</h2>
        <dl className="bq-sum">
          <div>
            <dt>
              <span className="bq-op" aria-hidden="true" />
              <span>
                رصيد مُرحَّل من السنوات السابقة
                <span className="bq-sum-sub">ما كان في الصندوق قبل بداية {termYear}</span>
              </span>
            </dt>
            <dd>
              <Num>{fmt(summary.openingBalance)}</Num>
            </dd>
          </div>
          <div>
            <dt>
              <span className="bq-op" aria-hidden="true">
                +
              </span>
              جُمع من الرسوم الشهرية
            </dt>
            <dd>
              <Roll value={summary.moneyIn} />
            </dd>
          </div>
          {summary.transfersIn > 0 && (
            <div>
              <dt>
                <span className="bq-op" aria-hidden="true">
                  +
                </span>
                حُوّل من الحملات
              </dt>
              <dd>
                <Num>{fmt(summary.transfersIn)}</Num>
              </dd>
            </div>
          )}
          <div>
            <dt>
              <span className="bq-op" aria-hidden="true">
                −
              </span>
              صُرف على الأنشطة
            </dt>
            <dd>
              <Num>{fmt(summary.moneyOut)}</Num>
            </dd>
          </div>
          {summary.adjustments !== 0 && (
            <div>
              <dt>
                <span className="bq-op" aria-hidden="true">
                  {summary.adjustments > 0 ? "+" : "−"}
                </span>
                فرق عند التسليم
              </dt>
              <dd>
                <Num>{fmt(Math.abs(summary.adjustments))}</Num>
              </dd>
            </div>
          )}
          <div className="is-total">
            <dt>
              <span className="bq-op" aria-hidden="true">
                =
              </span>
              في الصندوق الآن
            </dt>
            <dd>
              <Roll value={summary.balance} /> <span className="bq-unit">أوقية</span>
            </dd>
          </div>
        </dl>
        <p className="bq-hint">تبرعات الحملات تُحفظ في حسابها الخاص، ولا تدخل هنا.</p>
        <div className="bq-link-row">
          <Link href="/report#share" className="bq-link bq-press">
            {I.wa(18)} مشاركة التقرير
          </Link>
          <Link href="/report" className="bq-link bq-press">
            التقرير كاملًا {I.go(18)}
          </Link>
        </div>
      </section>

      <section className="bq-sec bq-rv" id="bq-pay" data-rv="acc-pay" aria-labelledby="bq-pay-h">
        <h2 id="bq-pay-h">كيف أدفع الرسوم؟</h2>
        <p className="bq-lead">حوّل إلى أحد هذه الأرقام، ثم أرسل صورة التحويل للجنة.</p>
        <PayTo accounts={accounts} />
      </section>

      <section className="bq-sec bq-rv" data-rv="acc-month" aria-labelledby="bq-mon-h">
        <h2 id="bq-mon-h">ما جُمع كل شهر</h2>
        <MonthRail months={monthly} payers={payers} current={currentMonth} />
      </section>

      <section className="bq-sec bq-rv" data-rv="acc-where" aria-labelledby="bq-where-h">
        <h2 id="bq-where-h">المصاريف</h2>
        {spent > 0 ? (
          <>
            <p className="bq-lead">
              صُرف هذا العام <Num className="bq-strong">{fmt(spent)}</Num> أوقية على:
            </p>
            <div
              className="bq-stack bq-grow"
              role="img"
              aria-label={spentBy
                .map((x) => `${categoryLabel(x.category)} ${fmt(x.total)}`)
                .join("، ")}
            >
              {spentBy.map((x) => (
                <span
                  key={x.category}
                  style={{ flexGrow: x.total, background: color[x.category] }}
                />
              ))}
            </div>
            <ul className="bq-list">
              {expenses.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    className="bq-row bq-press"
                    onClick={(ev) => open(e, ev.currentTarget)}
                  >
                    <span
                      className="bq-sw"
                      style={{ background: (e.category && color[e.category]) || "var(--n3)" }}
                      aria-hidden="true"
                    />
                    <span className="bq-row-m">
                      <span className="bq-row-t">{e.title}</span>
                      <span className="bq-row-s">
                        {e.category ? categoryLabel(e.category) : ""} · {dayWords(e.at)}
                      </span>
                    </span>
                    <span className="bq-row-e">
                      <Num className="bq-amt">{`−${fmt(e.amount)}`}</Num>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="bq-hint">لم يُصرف شيء هذا العام.</p>
        )}
      </section>

      {pastTerms.length > 0 && (
        <section className="bq-sec bq-rv" data-rv="acc-terms" aria-labelledby="bq-terms-h">
          <h2 id="bq-terms-h">الدورات السابقة</h2>
          <ul className="bq-list">
            {pastTerms.map((t) => (
              <li key={t.number}>
                <div className="bq-row">
                  <span
                    className="bq-av"
                    style={{ width: 40, height: 40, fontSize: 17 }}
                    aria-hidden="true"
                  >
                    <Num>{t.number}</Num>
                  </span>
                  <span className="bq-row-m">
                    <span className="bq-row-t">{t.title || `الدورة ${t.number}`}</span>
                    <span className="bq-row-s">
                      من {dayWords(t.startedOn)} <Num>{t.startedOn.slice(0, 4)}</Num>
                      {t.endedOn ? (
                        <>
                          {" "}
                          إلى {dayWords(t.endedOn)} <Num>{t.endedOn.slice(0, 4)}</Num>
                        </>
                      ) : null}
                    </span>
                    <span className="bq-row-s">
                      رصيد سابق <Num>{fmt(t.openingBalance)}</Num> · سُلّمت بـ{" "}
                      <Num>{fmt(t.closingBalance ?? 0)}</Num> أوقية · جُمع{" "}
                      <Num>{fmt(t.collected)}</Num> · صُرف <Num>{fmt(t.spent)}</Num>
                      {t.adjustment ? (
                        <>
                          {" "}
                          · فرق عند التسليم{" "}
                          <Num>{`${t.adjustment > 0 ? "+" : "−"}${fmt(Math.abs(t.adjustment))}`}</Num>
                        </>
                      ) : null}
                    </span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="bq-sec bq-rv" id="bq-ops" data-rv="acc-ops" aria-labelledby="bq-all-h">
        <h2 id="bq-all-h">كل العمليات</h2>
        <Segmented
          label="نوع العمليات"
          value={f}
          onChange={setF}
          items={[
            { k: "all", l: "الكل" },
            { k: "in", l: "دفعات" },
            { k: "out", l: "مصاريف" },
          ]}
        />
        {shown.length ? (
          <ul className="bq-list bq-gap-top">
            {shown.map((e) => (
              <EntryRow key={e.id} e={e} onOpen={open} />
            ))}
          </ul>
        ) : (
          <p className="bq-hint bq-gap-top">لا توجد عمليات بعد.</p>
        )}
      </section>

      {s && (
        <Sheet
          key={s.value.id}
          label={s.value.title}
          vt={s.vt}
          onDone={sheet.done}
          tryVTClose={sheet.tryVTClose}
        >
          <EntrySheetBody e={s.value} vt={s.vt} />
        </Sheet>
      )}
    </>
  );
}
