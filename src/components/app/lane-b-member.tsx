"use client";
// TODO(lane-b): stand-ins for MemberLinkPaste, MemberPushToggle and forgetMemberOnThisDevice from
// "@/components/providers". Swap the imports when they land, then delete this file.

/** Installed app with no member cookie: «لديك رابط؟ الصقه هنا» (Lane B). */
export function MemberLinkPaste(props: { hasMember: boolean }) {
  void props;
  return null;
}
/** Member notifications on /me (Lane B). */
export function MemberPushToggle() {
  return null;
}
/** Before «خروج من هذا الجهاز»: drop this device's member push subscription (Lane B). */
export async function forgetMemberOnThisDevice(): Promise<string | undefined> {
  return undefined;
}
