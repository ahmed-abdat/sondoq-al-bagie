// Small shared pieces that need no client state.
import Image from "next/image";
import type { MemberStatus, PaymentMethod } from "@/lib/data/types";
import { METHOD_LABELS, methodLogo } from "@/lib/methods";
import { memberLabel, memberState, splitRef, statusLabel } from "./derive";
import { I } from "./icons";

/**
 * The paper number is the avatar: big number, small group letter «أ»/«ب» under it. Inside one
 * group's section (`scoped`) the letter is left out.
 */
export function Avatar({
  m,
  scoped = false,
  size = 40,
  vt = false,
}: {
  m: { memberRef: string };
  scoped?: boolean;
  size?: number;
  /** morph source/target for the member sheet */
  vt?: boolean;
}) {
  const { letter, n } = splitRef(m.memberRef);
  const digits = String(n).length;
  const k = scoped ? (digits <= 2 ? 0.44 : 0.36) : digits <= 2 ? 0.36 : 0.3;
  return (
    <span
      className="bq-av"
      style={{
        width: size,
        height: size,
        viewTransitionName: vt ? "bq-av" : undefined,
      }}
      aria-hidden="true"
    >
      <span className="bq-num bq-av-n" style={{ fontSize: Math.max(13, Math.round(size * k)) }}>
        {n}
      </span>
      {!scoped && (
        <span className="bq-av-l" style={{ fontSize: Math.max(10, Math.round(size * 0.24)) }}>
          {letter}
        </span>
      )}
    </span>
  );
}

/** «أ 12» (or «12» when `scoped`), isolated so it never reorders in RTL text. */
export function MemberNo({ m, scoped }: { m: { memberRef: string }; scoped?: boolean }) {
  return <bdi className="bq-num bq-nowrap">{memberLabel(m, { scoped })}</bdi>;
}

/** Icon + word. Grey for late (never red), green tint for paid. Counts only, never amounts. */
export function StatusTag({
  m,
}: {
  m: Pick<MemberStatus, "status" | "monthsBehind" | "monthsPaidThisYear">;
}) {
  const st = memberState(m);
  const ok = st === "ok" || st === "ahead";
  return (
    <span className={`bq-tag ${ok ? "is-ok" : "is-late"}`}>
      {ok ? I.check(16) : st === "late" ? I.clock(16) : I.dots(16)}
      {statusLabel(m)}
    </span>
  );
}

/** Real wallet logo on a white tile (never recoloured) + Arabic name; cash/other get a line icon. */
export function MethodBadge({
  method,
  size = 28,
  label = true,
}: {
  method: PaymentMethod;
  size?: number;
  label?: boolean;
}) {
  const logo = methodLogo(method);
  return (
    <span className="bq-meth">
      <span
        className="bq-meth-tile"
        style={{ width: size, height: size, borderRadius: Math.round(size * 0.28) }}
      >
        {logo ? (
          <Image src={logo} alt={label ? "" : METHOD_LABELS[method]} width={size} height={size} />
        ) : method === "cash" ? (
          I.cash(Math.round(size * 0.64))
        ) : (
          I.dots(Math.round(size * 0.64))
        )}
      </span>
      {label && <span className="bq-meth-l">{METHOD_LABELS[method]}</span>}
    </span>
  );
}

/** One track; the paid part is filled from the start edge (transform only). */
export function Track({ f, label }: { f: number; label?: string }) {
  const v = Number.isFinite(f) ? Math.max(0, Math.min(1, f)) : 0;
  return (
    <div className="bq-track bq-grow" role={label ? "img" : undefined} aria-label={label}>
      <span style={{ transform: `scaleX(${v})` }} />
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  icon,
}: {
  title: string;
  hint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="bq-empty">
      {icon && <span className="bq-disc is-in">{icon}</span>}
      <p className="bq-empty-t">{title}</p>
      {hint && <p className="bq-hint">{hint}</p>}
    </div>
  );
}

/**
 * A paid month in the months grid (/report, the member card): a plain green check, no filled
 * disc (owner decision r25). Receipts keep their own ConfirmedMark.
 */
export function PaidCheck({
  size = 18,
  className = "bq-check",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg className={className} viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        d="M4.5 12.5l5 5L19.5 6.5"
        fill="none"
        stroke="var(--g7)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
