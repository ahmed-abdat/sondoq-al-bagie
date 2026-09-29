import "server-only";
// The device's member profiles in cookies (owner decision: a family phone keeps up to 5):
// bq_member = active token, bq_member_saved = JSON array of saved tokens (most recent first,
// active included), bq_member_pending = another member's link waiting for «أضف وانتقل» / «ابقَ»,
// bq_member_on = readable "has a member" flag. Tokens stay in httpOnly cookies; only hashes go to
// the database. Writes work in server actions and route handlers (not while rendering a page).
import { cookies } from "next/headers";
import { isMemberToken, liveProfiles, verifyMemberToken } from "./member";
import {
  MAX_MEMBER_PROFILES,
  MEMBER_COOKIE,
  MEMBER_COOKIE_MAX_AGE,
  MEMBER_MARKER_COOKIE,
  MEMBER_PENDING_COOKIE,
  MEMBER_PENDING_MAX_AGE,
  MEMBER_SAVED_COOKIE,
  type MemberProfile,
  type OpenLinkOutcome,
} from "./member-types";

/* ───────────── pure list rules (unit tested) ───────────── */

/** Valid, unique tokens from the cookie value, at most MAX_MEMBER_PROFILES. */
export function parseSaved(raw: string | undefined | null): string[] {
  let list: unknown;
  try {
    list = JSON.parse(raw ?? "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  return [
    ...new Set(list.filter((t): t is string => typeof t === "string" && isMemberToken(t))),
  ].slice(0, MAX_MEMBER_PROFILES);
}

/** `token` becomes the most recent; the least recently used falls off past the cap. */
export function withProfile(saved: string[], token: string): string[] {
  return [token, ...saved.filter((t) => t !== token)].slice(0, MAX_MEMBER_PROFILES);
}

export function withoutProfile(saved: string[], token: string): string[] {
  return saved.filter((t) => t !== token);
}

/* ───────────── cookie io ───────────── */

function options(maxAge: number, httpOnly = true) {
  return {
    httpOnly,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

/** Active token and the saved list (the active one always included, first when missing). */
export async function readProfiles(): Promise<{ active: string | null; saved: string[] }> {
  const jar = await cookies();
  const a = jar.get(MEMBER_COOKIE)?.value ?? "";
  const active = isMemberToken(a) ? a : null;
  let saved = parseSaved(jar.get(MEMBER_SAVED_COOKIE)?.value);
  if (active && !saved.includes(active)) saved = withProfile(saved, active);
  return { active, saved };
}

export async function readPending(): Promise<string | null> {
  const p = (await cookies()).get(MEMBER_PENDING_COOKIE)?.value ?? "";
  return isMemberToken(p) ? p : null;
}

/** Make `token` the active profile (most recent in the saved list). */
export async function activate(token: string, saved: string[]) {
  const jar = await cookies();
  jar.set(MEMBER_COOKIE, token, options(MEMBER_COOKIE_MAX_AGE));
  jar.set(
    MEMBER_SAVED_COOKIE,
    JSON.stringify(withProfile(saved, token)),
    options(MEMBER_COOKIE_MAX_AGE),
  );
  jar.set(MEMBER_MARKER_COOKIE, "1", options(MEMBER_COOKIE_MAX_AGE, false));
}

export async function setPending(token: string) {
  (await cookies()).set(MEMBER_PENDING_COOKIE, token, options(MEMBER_PENDING_MAX_AGE));
}

export async function clearPending() {
  (await cookies()).delete(MEMBER_PENDING_COOKIE);
}

/** No member on this device any more. */
export async function clearAll() {
  const jar = await cookies();
  for (const n of [MEMBER_COOKIE, MEMBER_SAVED_COOKIE, MEMBER_PENDING_COOKIE, MEMBER_MARKER_COOKIE])
    jar.delete(n);
}

/**
 * /m/<token> (and the paste-link flow), in a route handler or server action:
 * - invalid or revoked → "invalid" (cookies untouched);
 * - no active profile, the same one, or one already saved on this device → it becomes active;
 * - another member while one is active → kept as pending (10 min) → "pending": show
 *   «أضف X وانتقل إليه» (memberAcceptPending) / «ابقَ بالاسم الحالي» (memberDeclinePending).
 */
export async function openMemberLink(token: string): Promise<OpenLinkOutcome> {
  const session = await verifyMemberToken(token);
  if (!session) return "invalid";
  const { active, saved } = await readProfiles();
  if (!active || active === token || saved.includes(token)) {
    await activate(token, saved);
    await clearPending();
    return "active";
  }
  await setPending(token);
  return "pending";
}

/**
 * The «أنت» switcher: this device's saved profiles (active first, then most recent), invalid or
 * revoked ones left out. One RPC for all of them.
 */
export async function memberProfiles(): Promise<MemberProfile[]> {
  const { active, saved } = await readProfiles();
  const live = await liveProfiles(saved);
  return saved.flatMap((t) => {
    const p = live.get(t);
    return p ? [{ ...p, active: t === active }] : [];
  });
}
