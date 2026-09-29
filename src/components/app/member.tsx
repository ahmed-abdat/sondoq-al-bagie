"use client";
// Member row (list) and the member sheet body (twelve months in words).
import { decodeMonths } from "@/lib/data/month-code";
import type { MemberRow, MemberStatus } from "@/lib/data/types";
import { Avatar, PaidCheck, StatusTag } from "./bits";
import {
  fmt,
  groupLabel,
  memberLabel,
  memberState,
  monthCells,
  monthsLabel,
  lateCount,
  MONTHS,
} from "./derive";
import { I } from "./icons";
import { Num } from "./num";

export function MemberRow<T extends MemberStatus>({
  m,
  onPick,
  scoped,
}: {
  m: T;
  onPick: (m: T, from: HTMLElement | null) => void;
  /** inside one group's section: number only */
  scoped?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        className="bq-row bq-press"
        onClick={(e) => onPick(m, e.currentTarget.querySelector<HTMLElement>(".bq-av"))}
        aria-label={`${memberLabel(m)}، ${m.fullName}`}
      >
        <Avatar m={m} scoped={scoped} />
        <span className="bq-row-m">
          <span className="bq-row-t">{m.fullName}</span>
          <span className="bq-row-s">المجموعة {groupLabel(m.groupCode)}</span>
        </span>
        <StatusTag m={m} />
      </button>
    </li>
  );
}

/** What the member sheet needs besides the member (server-computed, same for every member). */
export type MemberCtx = {
  year: number;
  dueMonth: number;
  prices: Record<string, number>;
  /** the admin switch «إظهار المبالغ المتأخرة» */
  showOwed: boolean;
};

/**
 * A member's months this year: the count line, the late line and the twelve cells in the
 * report's language. Public member sheet and the committee's member sheet (audit C7).
 */
export function MemberMonths({
  m,
  ctx,
}: {
  m: Pick<MemberRow, "months" | "memberId" | "status" | "monthsBehind" | "monthsPaidThisYear">;
  ctx: Pick<MemberCtx, "year" | "dueMonth">;
}) {
  const { year } = ctx;
  const cells = monthCells(decodeMonths(m.months, m.memberId, ctx.year), ctx.dueMonth);
  const owed = cells.filter((c) => c.state === "owed").map((c) => c.month);
  const paidDue = cells.filter((c) => c.state === "paid").length;
  const aheadMonths = cells.filter((c) => c.state === "ahead").map((c) => c.month);
  const paidAll = cells.every((c) => c.state === "paid" || c.state === "ahead");
  const lastAhead = aheadMonths.length ? Math.max(...aheadMonths) : 0;
  const due = paidDue + owed.length;
  const st = memberState(m);
  return (
    <>
      {st !== "off" &&
        (paidAll ? (
          <p className="bq-mline">
            دفع رسوم السنة كاملة · <Num className="bq-strong">12</Num> شهرًا
          </p>
        ) : due > 0 ? (
          <p className="bq-mline">
            دفع <Num className="bq-strong">{paidDue}</Num> من <Num className="bq-strong">{due}</Num>{" "}
            {due <= 2
              ? due === 1
                ? "شهر مستحق"
                : "شهرين مستحقين"
              : due <= 10
                ? "أشهر مستحقة"
                : "شهرًا مستحقًا"}
            {lastAhead ? ` ومقدَّمًا حتى ${MONTHS[lastAhead - 1]}` : ""}
          </p>
        ) : null)}
      {st !== "ok" && st !== "ahead" && (
        <p className="bq-mstatus is-late">
          {I.clock(18)}
          {st === "off"
            ? "لا تُستحق عليه رسوم الآن"
            : m.monthsPaidThisYear === 0
              ? "لم يدفع هذا العام"
              : `متأخر عن رسوم ${lateCount(owed.length || m.monthsBehind)}${owed.length ? `: ${monthsLabel(owed)}` : ""}`}
        </p>
      )}
      <ol className="bq-months" aria-label={`أشهر ${year}`}>
        {cells.map((c) => (
          <li key={c.month} className={`bq-mo mo-${c.state === "off" ? "future" : c.state}`}>
            <span className="bq-mo-n">{MONTHS[c.month - 1]}</span>
            <span className="bq-mo-s">
              {c.state === "paid" ? (
                <>
                  <PaidCheck size={16} /> مدفوع
                </>
              ) : c.state === "ahead" ? (
                <>
                  <PaidCheck size={16} /> مدفوع <span className="bq-mo-tag">مقدَّمًا</span>
                </>
              ) : c.state === "owed" ? (
                "لم يُدفع"
              ) : c.state === "off" ? (
                "غير مستحق"
              ) : (
                "لم يحن"
              )}
            </span>
          </li>
        ))}
      </ol>
    </>
  );
}

export function MemberSheetBody({ m, ctx, vt }: { m: MemberRow; ctx: MemberCtx; vt: boolean }) {
  const price = ctx.prices[m.groupCode] ?? null;
  const showOwed = ctx.showOwed;
  return (
    <>
      <div className="bq-mhead">
        <Avatar m={m} size={56} vt={vt} />
        <div>
          <h2>{m.fullName}</h2>
          {/* the avatar already shows the number (audit V6) */}
          <p className="bq-hint">
            المجموعة {groupLabel(m.groupCode)}
            {price ? (
              <span className="bq-mhead-fee">
                الرسوم الشهرية <Num>{fmt(price)}</Num> أوقية
              </span>
            ) : null}
          </p>
        </div>
      </div>
      <MemberMonths m={m} ctx={ctx} />
      {showOwed && m.amountOwed ? (
        <p className="bq-owed">
          المتأخر عليه حتى الآن: <Num className="bq-strong">{fmt(m.amountOwed)}</Num> أوقية
          {price ? (
            <>
              {" "}
              من رسوم السنة <Num>{fmt(price * 12)}</Num>
            </>
          ) : null}
        </p>
      ) : (
        <p className="bq-hint bq-note">لا تُعرض المبالغ هنا. يرى الجميع الأشهر فقط.</p>
      )}
    </>
  );
}
