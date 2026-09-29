"use server";
// Who is looking, for committee-only actions on public pages (the pages themselves are cached
// for everyone). The server action behind each button checks the role again.
import { ROLE_LABEL } from "./derive";
import * as src from "./source";

/** Name + role label when the viewer may cancel payments (admin, treasurer, deputy), else null. */
export async function whoCanCancel(): Promise<{ by: string; role: string } | null> {
  const s = await src.committeeSession().catch(() => null);
  if (!s || s.role === "committee") return null;
  return { by: s.displayName, role: ROLE_LABEL[s.role] };
}
