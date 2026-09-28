// Small shared pieces that need no client state.
import Image from "next/image";
import type { MemberStatus, PaymentMethod } from "@/lib/data/types";
import { METHOD_LABELS, methodLogo } from "@/lib/methods";
import { memberState, statusLabel } from "./derive";
import { I } from "./icons";

/** The member NUMBER is the avatar: it is the identifier people already use. */
export function Avatar({ no, size = 40 }: { no: number; size?: number }) {
  return (
    <span
      className="bq-av"
      style={{ width: size, height: size, fontSize: Math.round(size * (no > 9 ? 0.4 : 0.44)) }}
      aria-hidden="true"
    >
      <bdi dir="ltr" className="bq-num">
        {no}
      </bdi>
    </span>
  );
}

/** Icon + word. Grey for late (never red), green tint for paid. Counts only, never amounts. */
export function StatusTag({ m }: { m: MemberStatus }) {
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
