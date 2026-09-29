"use server";
// TODO(lane-a): stand-in for src/lib/data/member-actions.ts (member writes) and the committee's
// createMemberLink / revokeMemberLink in src/lib/data/actions.ts. Until they land, the real
// writes answer «not ready»; sign-out already clears the cookies.
import { cookies } from "next/headers";
import type { ActionResult } from "@/lib/data/types";
import {
  MEMBER_COOKIE,
  MEMBER_MARKER_COOKIE,
  type IssuedMemberLink,
  type MemberSubmitInput,
  type MemberSubmitResult,
} from "./member-types";

const notReady = async <T,>(): Promise<ActionResult<T>> => ({
  ok: false,
  code: "not_ready",
  message: "هذه الخدمة لم تُفعَّل بعد.",
});

export async function memberUploadProof(
  form: FormData,
): Promise<ActionResult<{ path: string; hash: string }>> {
  void form;
  return notReady();
}
export async function memberSubmitPayment(
  input: MemberSubmitInput,
): Promise<ActionResult<MemberSubmitResult>> {
  void input;
  return notReady();
}
export async function memberSignOut(input: { endpoint?: string } = {}): Promise<ActionResult> {
  void input;
  const jar = await cookies();
  jar.delete(MEMBER_COOKIE);
  jar.delete(MEMBER_MARKER_COOKIE);
  return { ok: true, data: undefined };
}
export async function createMemberLink(input: {
  memberId: string;
}): Promise<ActionResult<IssuedMemberLink>> {
  void input;
  return notReady();
}
export async function revokeMemberLink(input: { memberId: string }): Promise<ActionResult> {
  void input;
  return notReady();
}
