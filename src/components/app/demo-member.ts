// Demo only (fixtures, never production): the fixture members behind /m/demo and /m/demo2. The
// profiles of the phone use the real cookie rules (src/lib/member-cookies.ts); here only which
// tokens the demo knows. Pure, unit tested.
import type { MemberJar } from "@/lib/member-cookies";

export const DEMO_TOKENS = ["demo", "demo2"] as const;
export type DemoToken = (typeof DEMO_TOKENS)[number];
export const isDemoToken = (t: string | undefined | null): t is DemoToken =>
  !!t && (DEMO_TOKENS as readonly string[]).includes(t);

export type DemoPhone = { active: DemoToken | null; profiles: DemoToken[]; pending: DemoToken | null };

/** The jar as the demo sees it: real tokens (never in demo) are ignored. */
export function demoPhoneOf(jar: MemberJar): DemoPhone {
  const profiles = jar.saved.filter(isDemoToken);
  return {
    active: isDemoToken(jar.active) ? jar.active : null,
    profiles,
    pending: isDemoToken(jar.pending) ? jar.pending : null,
  };
}
