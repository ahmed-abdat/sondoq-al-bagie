"use client";
// Member row (list) and the member sheet body (twelve months in words).
import type { MemberMonth, MemberStatus } from "@/lib/data/types";
import { Avatar, StatusTag } from "./bits";
import {
  fmt,
  groupLabel,
  memberCode,
  memberState,
  monthCells,
  monthsLabel,
  monthsWord,
  MONTHS,
} from "./derive";
import { I } from "./icons";
import { Num } from "./num";

export function MemberRow({
  m,
  onPick,
}: {
  m: MemberStatus;
  onPick: (m: MemberStatus, from: HTMLElement | null) => void;
}) {
  return (
    <li>
      <button
        type="button"
        className="bq-row bq-press"
        onClick={(e) => onPick(m, e.currentTarget.querySelector<HTMLElement>(".bq-av"))}
        aria-label={`${memberCode(m)}، ${m.fullName}`}
      >
        <Avatar code={memberCode(m)} />
        <span className="bq-row-m">
          <span className="bq-row-t">{m.fullName}</span>
          <span className="bq-row-s">
            رقم <Num>{memberCode(m)}</Num> · الفئة {groupLabel(m.groupCode)}
          </span>
        </span>
        <StatusTag m={m} />
      </button>
    </li>
  );
}

/** What the member sheet needs besides the member (server-computed, same for every member). */
export type MemberCtx = {
  /** this year's months of every member */
  months: MemberMonth[];
  year: number;
  dueMonth: number;
  prices: Record<string, number>;
  /** the admin switch «إظهار المبالغ المتأخرة» */
  showOwed: boolean;
};

export function MemberSheetBody({ m, ctx, vt }: { m: MemberStatus; ctx: MemberCtx; vt: boolean }) {
  const { year } = ctx;
  const price = ctx.prices[m.groupCode] ?? null;
  const showOwed = ctx.showOwed;
  const cells = monthCells(
    ctx.months.filter((x) => x.memberId === m.memberId),
    ctx.dueMonth,
  );
  const owed = cells.filter((c) => c.state === "owed").map((c) => c.month);
  const paidDue = cells.filter((c) => c.state === "paid").length;
  const due = paidDue + owed.length;
  const st = memberState(m);
  return (
    <>
      <div className="bq-mhead">
        <span
          className="bq-av"
          style={{
            width: 56,
            height: 56,
            fontSize: 24,
            viewTransitionName: vt ? "bq-av" : undefined,
          }}
          aria-hidden="true"
        >
          <Num>{memberCode(m)}</Num>
        </span>
        <div>
          <h2>{m.fullName}</h2>
          <p className="bq-hint">
            رقم <Num>{memberCode(m)}</Num> · الفئة {groupLabel(m.groupCode)}
            {price ? (
              <>
                {" "}
                · الرسوم الشهرية: <Num>{fmt(price)}</Num> أوقية
              </>
            ) : null}
          </p>
        </div>
      </div>
      {st !== "off" && due > 0 && (
        <p className="bq-mline">
          دفع رسوم <Num className="bq-strong">{paidDue}</Num> من{" "}
          <Num className="bq-strong">{due}</Num> {due <= 10 ? "أشهر" : "شهرًا"} مستحقة
        </p>
      )}
      {st !== "ok" && (
        <p className={`bq-mstatus ${st === "ahead" ? "is-ok" : "is-late"}`}>
          {st === "ahead" ? I.check(18) : I.clock(18)}
          {st === "ahead"
            ? "مدفوع حتى ديسمبر"
            : st === "off"
              ? "لا تُستحق عليه رسوم الآن"
              : m.monthsPaidThisYear === 0
                ? "لم يدفع هذا العام"
                : `متأخر عن رسوم ${monthsWord(owed.length || m.monthsBehind)}${owed.length ? `: ${monthsLabel(owed)}` : ""}`}
        </p>
      )}
      <ol className="bq-months" aria-label={`أشهر ${year}`}>
        {cells.map((c) => (
          <li key={c.month} className={`bq-mo mo-${c.state === "off" ? "future" : c.state}`}>
            <span className="bq-mo-n">{MONTHS[c.month - 1]}</span>
            <span className="bq-mo-s">
              {c.state === "paid" ? (
                <>{I.check(16)} مدفوع</>
              ) : c.state === "ahead" ? (
                <>{I.check(16)} مدفوع مسبقًا</>
              ) : c.state === "owed" ? (
                <>{I.clock(16)} متأخر</>
              ) : c.state === "off" ? (
                "غير مستحق"
              ) : (
                "لم يحن"
              )}
            </span>
          </li>
        ))}
      </ol>
      {showOwed && m.amountOwed ? (
        <p className="bq-owed">
          المبلغ المتأخر: <Num className="bq-strong">{fmt(m.amountOwed)}</Num> أوقية
        </p>
      ) : (
        <p className="bq-hint bq-note">لا تُعرض المبالغ هنا. يرى الجميع الأشهر فقط.</p>
      )}
    </>
  );
}
