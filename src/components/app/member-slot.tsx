"use client";
// Home: the «أنت» card, only in a browser that opened a member's personal link (the readable
// marker cookie). Everyone else gets the public page unchanged and loads none of this code.
import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import { MemberLinkPaste } from "@/components/providers";
import { hasMemberFlag } from "@/lib/member-link";

const MemberCard = dynamic(() => import("./member-card").then((m) => m.MemberCard), {
  ssr: false,
});

const hasMarker = () => hasMemberFlag(document.cookie);

export function MemberSlot() {
  const on = useSyncExternalStore(
    () => () => {},
    hasMarker,
    () => false,
  );
  return on ? <MemberCard /> : <MemberLinkPaste />;
}
