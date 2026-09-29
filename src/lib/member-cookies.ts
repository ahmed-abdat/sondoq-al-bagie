// Every read and write of the member cookies (docs/MEMBER-ACCESS.md: one phone, up to 5 member
// profiles). Used by the /m/<token> route and by Lane A's member actions, so the rules live in
// one place. Pure decisions + a thin adapter over any cookie store with get/set/delete
// (NextRequest.cookies to read, NextResponse.cookies or next/headers cookies() to write).
import {
  MEMBER_COOKIE,
  MEMBER_COOKIE_MAX_AGE,
  MEMBER_MARKER_COOKIE,
} from "@/lib/data/member-types";

/** httpOnly JSON array of the tokens saved on this phone (active included), at most 5. */
export const MEMBER_SAVED_COOKIE = "bq_member_saved";
/** httpOnly: a link of another person opened here, waiting for «أضف … وانتقل إليه» (10 min). */
export const MEMBER_PENDING_COOKIE = "bq_member_pending";
export const MAX_PROFILES = 5;
export const PENDING_MAX_AGE = 10 * 60;

/** The member cookies of one request. */
export interface MemberJar {
  /** the profile in use («أنت») */
  active: string | null;
  /** all profiles on this phone, the active one included, most recently used first */
  saved: string[];
  /** another person's link waiting for the member's choice */
  pending: string | null;
}

export const EMPTY_JAR: MemberJar = { active: null, saved: [], pending: null };

// what we accept back from a cookie (our tokens are 43 chars; the demo's is a short word)
const TOKEN = /^[A-Za-z0-9_-]{1,128}$/;
const token = (v: unknown): string | null => (typeof v === "string" && TOKEN.test(v) ? v : null);

/** Newest first, no duplicates, at most MAX_PROFILES. */
function front(saved: string[], t: string): string[] {
  return [t, ...saved.filter((s) => s !== t)].slice(0, MAX_PROFILES);
}

function parseSaved(raw: string | undefined): string[] {
  try {
    const v: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(v)) return [];
    return [...new Set(v.map(token).filter((t): t is string => !!t))].slice(0, MAX_PROFILES);
  } catch {
    return [];
  }
}

/* ───────────── decisions (pure) ───────────── */

export type LinkOpened = { jar: MemberJar; to: "/?welcome=1" | "/" | "/m/switch" };

/**
 * A valid link was opened (check it with verifyMemberToken first; invalid → /m/invalid, jar
 * unchanged):
 * - no profile here yet → it becomes the active one, welcome (install invite);
 * - already saved → it becomes the active one, home;
 * - another person → kept aside as pending, the choice page /m/switch.
 */
export function openLink(jar: MemberJar, t: string): LinkOpened {
  if (!jar.active || !jar.saved.length)
    return { jar: { active: t, saved: front(jar.saved, t), pending: null }, to: "/?welcome=1" };
  if (jar.saved.includes(t))
    return { jar: { active: t, saved: front(jar.saved, t), pending: null }, to: "/" };
  return { jar: { ...jar, pending: t }, to: "/m/switch" };
}

/**
 * «أضف … وانتقل إليه»: the pending profile is saved and becomes active. With 5 already saved,
 * the least recently used one is dropped (returned, so the page can say so).
 */
export function acceptPending(jar: MemberJar): { jar: MemberJar; dropped: string | null } {
  if (!jar.pending) return { jar, dropped: null };
  const all = [jar.pending, ...jar.saved.filter((s) => s !== jar.pending)];
  return {
    jar: { active: jar.pending, saved: all.slice(0, MAX_PROFILES), pending: null },
    dropped: all.length > MAX_PROFILES ? all[all.length - 1] : null,
  };
}

/** «ابقَ باسم …»: forget the pending link. */
export function declinePending(jar: MemberJar): MemberJar {
  return { ...jar, pending: null };
}

/** The switcher: make a saved profile the active one (unknown tokens are ignored). */
export function switchTo(jar: MemberJar, t: string): MemberJar {
  return jar.saved.includes(t) ? { ...jar, active: t, saved: front(jar.saved, t) } : jar;
}

/**
 * «خروج من هذا الجهاز» for one profile (default: the active one). The next saved profile becomes
 * active. `last` = nothing left on this phone (then call forgetMemberOnThisDevice in the browser).
 */
export function removeProfile(
  jar: MemberJar,
  t: string | null = jar.active,
): {
  jar: MemberJar;
  last: boolean;
} {
  const saved = jar.saved.filter((s) => s !== t);
  const active = jar.active === t ? (saved[0] ?? null) : jar.active;
  return { jar: { active, saved, pending: jar.pending }, last: saved.length === 0 };
}

/* ───────────── cookie store adapter ───────────── */

/** What NextRequest.cookies, NextResponse.cookies and next/headers cookies() have in common. */
export interface CookieReader {
  get(name: string): { value: string } | undefined;
}
export interface CookieWriter {
  set(name: string, value: string, options: CookieOptions): unknown;
  delete(name: string): unknown;
}
interface CookieOptions {
  httpOnly?: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
}

export function readJar(store: CookieReader): MemberJar {
  const active = token(store.get(MEMBER_COOKIE)?.value);
  let saved = parseSaved(store.get(MEMBER_SAVED_COOKIE)?.value);
  // phones from before profiles: only the key cookie
  if (active && !saved.includes(active)) saved = front(saved, active);
  return { active, saved, pending: token(store.get(MEMBER_PENDING_COOKIE)?.value) };
}

const base = { secure: true, sameSite: "lax" as const, path: "/" };

/** Writes the whole jar: set what is there, delete what is not. */
export function writeJar(store: CookieWriter, jar: MemberJar): void {
  const year = { ...base, maxAge: MEMBER_COOKIE_MAX_AGE };
  if (jar.active) store.set(MEMBER_COOKIE, jar.active, { ...year, httpOnly: true });
  else store.delete(MEMBER_COOKIE);
  if (jar.saved.length) {
    store.set(MEMBER_SAVED_COOKIE, JSON.stringify(jar.saved), { ...year, httpOnly: true });
    store.set(MEMBER_MARKER_COOKIE, "1", year); // readable: «this phone has a member link»
  } else {
    store.delete(MEMBER_SAVED_COOKIE);
    store.delete(MEMBER_MARKER_COOKIE);
  }
  if (jar.pending)
    store.set(MEMBER_PENDING_COOKIE, jar.pending, {
      ...base,
      httpOnly: true,
      maxAge: PENDING_MAX_AGE,
    });
  else store.delete(MEMBER_PENDING_COOKIE);
}
