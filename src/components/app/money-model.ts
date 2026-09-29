// Money privacy (docs/MONEY-PRIVACY.md): what the browser of the committee or of a member with
// their link receives, in one private, never-cached answer. Strangers get null.
import type { MoneyBundle } from "@/lib/data/types";
import type { LedgerEntry } from "./types";

export type ClientMoney = MoneyBundle & {
  /** payments and expenses with amounts and receipt codes, newest first (receipts preloaded) */
  ledger: LedgerEntry[];
};

/** Cookies that mean «maybe allowed to see money»: a member link, a Supabase session, or the
 *  demo committee. Without one, the browser never asks (a stranger costs no request). */
export const MONEY_COOKIE_RE =
  /(?:^|;\s*)(?:bq_member_on=1|sb-[^=]*-auth-token[^=]*=|bq_demo_committee=1)/;

/** The same check as an inline script, run before paint: hides the stranger hint at once. */
export const MONEY_FLAG_SCRIPT = `try{if(${MONEY_COOKIE_RE.toString()}.test(document.cookie))document.documentElement.dataset.money="1"}catch(e){}`;
