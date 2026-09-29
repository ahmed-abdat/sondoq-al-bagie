"use client";
// Home: the «أنت» card, only in a browser that opened a member's personal link (the readable
// marker cookie). Everyone else gets the public page unchanged and loads none of this code.
import dynamic from "next/dynamic";
import { useState, useSyncExternalStore } from "react";
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
  // first open of the personal link (/?welcome=1): read at hydration, before the install
  // provider drops the marker and before the card's code has loaded (audit M5)
  const [welcome] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("welcome") === "1",
  );
  return on ? <MemberCard welcome={welcome} /> : <MemberLinkPaste />;
}
