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
  MONTHS,
  statusLabel,
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
 * A member's months this year: one status phrase and the twelve cells in the
 * report's language. Public member sheet and the committee's member sheet (audit C7).
 */
export function MemberMonths({
  m,
  ctx,
}: {
  m: Pick<
    MemberRow,
    "months" | "memberId" | "status" | "monthsBehind" | "monthsPaidThisYear" | "pastLate"
  >;
  ctx: Pick<MemberCtx, "year" | "dueMonth">;
}) {
  const { year } = ctx;
  const cells = monthCells(decodeMonths(m.months, m.memberId, ctx.year), ctx.dueMonth);
  const st = memberState(m);
  // one phrase, «دفع حتى أغسطس 2026» (UX-PATTERNS P1): no counts, lateness is implicit
  return (
    <>
      {st === "off" ? (
        <p className="bq-mstatus is-late">
          {I.clock(18)}
          لا تُستحق عليه رسوم الآن
        </p>
      ) : st === "late" ? (
        <p className="bq-mstatus is-late">
          {I.clock(18)}
          {statusLabel(m, year)}
        </p>
      ) : (
        <p className="bq-mline">{statusLabel(m, year)}</p>
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
