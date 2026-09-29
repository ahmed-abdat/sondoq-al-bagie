"use client";
import { useLayoutEffect, useRef, useState } from "react";
import type { MonthlyCollection } from "@/lib/data/types";
import { fmt, memberCount, MONTHS } from "./derive";
import { Num } from "./num";

/** «ما جُمع كل شهر»: twelve snapping bars; selecting one updates the figure above. */
export function MonthRail({
  months,
  payers,
  current,
}: {
  months: MonthlyCollection[];
  /** members who paid each month (index 0 = January) */
  payers: number[];
  /** the month shown first (this month) */
  current: number;
}) {
  const [sel, setSel] = useState(current);
  const rail = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const r = rail.current;
    const on = r?.querySelector<HTMLElement>(`[data-m="${current}"]`);
    if (!r || !on || r.scrollWidth <= r.clientWidth) return;
    // RTL-safe: scroll the rail itself (not the page) so this month sits in the middle
    const rr = r.getBoundingClientRect();
    const or = on.getBoundingClientRect();
    r.scrollLeft += or.left + or.width / 2 - (rr.left + rr.width / 2);
  }, [current]);
  const byMonth = (n: number) => months.find((m) => m.month === n);
  const row = byMonth(sel);
  const v = row?.collected ?? 0;
  const expected = row?.expected ?? 0;
  const fut = sel > current;
  const n = payers[sel - 1] ?? 0;
  const max = Math.max(1, ...months.map((m) => Math.max(m.expected, m.collected)));
  return (
    <>
      <div className="bq-mr-cap" aria-live="polite">
        <p className="bq-mr-m">
          {MONTHS[sel - 1]} {sel === current && <span className="bq-now">هذا الشهر</span>}
        </p>
        <p className="bq-big">
          <Num>{fmt(v)}</Num> <span>أوقية</span>
        </p>
        <p className="bq-lead">
          {fut ? (
            v && n > 0 ? (
              <>دفعها مقدّمًا {memberCount(n)}.</>
            ) : (
              "لم يحن هذا الشهر بعد."
            )
          ) : (
            <>
              من <Num>{fmt(expected)}</Num> متوقّعة · {n ? `دفع ${memberCount(n)}` : "لم يدفع أحد"}
            </>
          )}
        </p>
      </div>
      <div className="bq-rail-m bq-grow" ref={rail} role="group" aria-label="اختر شهرًا">
        {MONTHS.map((name, k) => {
          const m = k + 1;
          const c = byMonth(m)?.collected ?? 0;
          const f = Math.max(0.03, Math.min(1, c / (byMonth(m)?.expected || max)));
          return (
            <button
              key={m}
              type="button"
              data-m={m}
              className={`bq-mbar bq-press ${m === sel ? "on" : ""} ${m > current ? "fut" : ""} ${m === current ? "cur" : ""}`}
              aria-pressed={m === sel}
              onClick={() => setSel(m)}
              aria-label={`${name}: ${fmt(c)} أوقية`}
            >
              <span className="bq-mbar-t">
                <span
                  className="bq-mbar-f"
                  style={{ transform: `scaleY(${f})`, ["--i" as string]: k }}
                />
              </span>
              <span className="bq-mbar-l">{name}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
