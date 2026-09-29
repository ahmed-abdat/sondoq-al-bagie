"use client";
// Home: the «أنت» card, only in a browser that opened a member's personal link (the readable
// marker cookie). Everyone else gets the public page unchanged and loads none of this code.
import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import { MemberLinkPaste } from "./lane-b-member";
import { MEMBER_MARKER_COOKIE } from "./member-types";

const MemberCard = dynamic(() => import("./member-card").then((m) => m.MemberCard), {
  ssr: false,
});

const re = new RegExp(`(?:^|;\\s*)${MEMBER_MARKER_COOKIE}=1(?:;|$)`);
const hasMarker = () => re.test(document.cookie);

export function MemberSlot() {
  const on = useSyncExternalStore(
    () => () => {},
    hasMarker,
    () => false,
  );
  return on ? <MemberCard /> : <MemberLinkPaste hasMember={false} />;
}
