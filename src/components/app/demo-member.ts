// Demo only (fixtures, never production): the member profiles of this phone, kept in cookies so the
// server pages see them like real links. Pure, unit tested. Tokens: DEMO_TOKENS (fixture members).
export const DEMO_TOKENS = ["demo", "demo2"] as const;
export type DemoToken = (typeof DEMO_TOKENS)[number];
export const isDemoToken = (t: string | undefined | null): t is DemoToken =>
  !!t && (DEMO_TOKENS as readonly string[]).includes(t);

/** httpOnly demo cookies next to MEMBER_COOKIE (which holds the active demo token). */
export const DEMO_PROFILES_COOKIE = "bq_demo_profiles";
export const DEMO_PENDING_COOKIE = "bq_demo_pending";
/** A phone holds at most this many member profiles (owner decision). */
export const MAX_PROFILES = 5;

export type DemoPhone = { active: DemoToken | null; profiles: DemoToken[]; pending: DemoToken | null };

export function readDemoPhone(get: (name: string) => string | undefined, activeCookie: string) {
  const active = get(activeCookie);
  const profiles = (get(DEMO_PROFILES_COOKIE) ?? "").split(",").filter(isDemoToken);
  const pending = get(DEMO_PENDING_COOKIE);
  const a = isDemoToken(active) ? active : null;
  return {
    active: a,
    profiles: a && !profiles.includes(a) ? [a, ...profiles] : profiles,
    pending: isDemoToken(pending) && pending !== a ? pending : null,
  } satisfies DemoPhone;
}

/** Opening a link: first one → active; one already here → switch to it; another → ask first. */
export function openLink(p: DemoPhone, t: DemoToken): DemoPhone {
  if (!p.active) return { active: t, profiles: [t], pending: null };
  if (p.active === t) return { ...p, pending: null };
  if (p.profiles.includes(t)) return { ...p, active: t, pending: null };
  return { ...p, pending: t };
}
/** «أضف … وانتقل إليه». Null when the phone is full. */
export function acceptPending(p: DemoPhone): DemoPhone | null {
  if (!p.pending) return p;
  if (p.profiles.length >= MAX_PROFILES) return null;
  return { active: p.pending, profiles: [...p.profiles, p.pending], pending: null };
}
export const declinePending = (p: DemoPhone): DemoPhone => ({ ...p, pending: null });
export function switchTo(p: DemoPhone, t: DemoToken): DemoPhone {
  return p.profiles.includes(t) ? { ...p, active: t } : p;
}
/** «إزالة … من هذا الهاتف»: only the active one goes; the next one (if any) becomes active. */
export function removeActive(p: DemoPhone): DemoPhone {
  const profiles = p.profiles.filter((x) => x !== p.active);
  return { active: profiles[0] ?? null, profiles, pending: null };
}
