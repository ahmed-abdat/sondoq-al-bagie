"use server";
// TODO(lane-a): stand-ins for memberSwitch / memberAcceptPending / memberDeclinePending in
// src/lib/data/member-actions.ts (a phone holds up to 5 member profiles).
import type { ActionResult } from "@/lib/data/types";

const notReady = async (): Promise<ActionResult> => ({
  ok: false,
  code: "not_ready",
  message: "هذه الخدمة لم تُفعَّل بعد.",
});

export async function memberSwitch(input: { linkId: string }): Promise<ActionResult> {
  void input;
  return notReady();
}
export async function memberAcceptPending(): Promise<ActionResult> {
  return notReady();
}
export async function memberDeclinePending(): Promise<ActionResult> {
  return notReady();
}
