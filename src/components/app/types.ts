import type { MyProfile as DataMyProfile } from "@/lib/data/types";
// UI view models built from the Lane A types (see source.ts for the mapping).

/** «حسابي»: Lane A's profile plus, from the session, whether they confirm payments. */
export type MyProfile = DataMyProfile & { canConfirm: boolean };
