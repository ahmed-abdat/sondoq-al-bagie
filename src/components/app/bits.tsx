// Small shared pieces that need no client state.
import Image from "next/image";
import type { PaymentMethod } from "@/lib/data/types";
import { METHOD_LABELS, methodLogo } from "@/lib/methods";
import { memberLabel } from "./derive";
import { I } from "./icons";

/**
 * The ONE member avatar: the paper number «أ 12» on a round tile (the same as the admin screens'
 * Avatar; the style lives in globals.css so pages outside the admin shell have it). `size` 56 =
 * the member's own header tile.
 */
export function Avatar({ m, size }: { m: { memberRef: string }; size?: number }) {
  return (
    <span className={`pa-av ${size && size >= 56 ? "pa-av-g" : ""}`} aria-hidden="true">
      {memberLabel(m)}
    </span>
  );
}

/** «أ 12» (or «12» when `scoped`), isolated so it never reorders in RTL text. */
export function MemberNo({ m, scoped }: { m: { memberRef: string }; scoped?: boolean }) {
  return <bdi className="bq-num bq-nowrap">{memberLabel(m, { scoped })}</bdi>;
}

/** Real wallet logo on a white tile (never recoloured) + Arabic name; cash/other get a line icon. */
export function MethodBadge({
  method,
  size = 28,
  label = true,
  decorative = false,
}: {
  method: PaymentMethod;
  size?: number;
  label?: boolean;
  /** the wallet name is already written next to it: the logo says nothing (audit B11) */
  decorative?: boolean;
}) {
  const logo = methodLogo(method);
  return (
    <span className="bq-meth">
      <span
        className="bq-meth-tile"
        style={{ width: size, height: size, borderRadius: Math.round(size * 0.28) }}
      >
        {logo ? (
          <Image
            src={logo}
            alt={label || decorative ? "" : METHOD_LABELS[method]}
            width={size}
            height={size}
          />
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
