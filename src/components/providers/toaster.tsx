"use client";

import type { CSSProperties } from "react";
import { Toaster as Sonner } from "sonner";

// DESIGN.md snackbar: Forest Deep card, white 14px text, green-tinted shadow; the action is a
// Green Mist text button (≥ 44px, outlined so it reads as a button). Explicit colours, no theme
// tokens, so a toast can never render transparent. A faint white ring separates the dark card
// from the green hero.
const FOREST_DEEP = "#0E3A1B";
const GREEN_MIST = "#CFE7D4";

const TOAST: CSSProperties = {
  background: FOREST_DEEP,
  color: "#ffffff",
  border: "none",
  borderRadius: 18,
  boxShadow:
    "0 0 0 1px rgba(255, 255, 255, 0.12), 0 14px 30px -14px rgba(14, 58, 27, 0.55), 0 2px 8px rgba(14, 58, 27, 0.18)",
  padding: "8px 16px",
  gap: 12,
  fontFamily: "var(--font-body), Tahoma, sans-serif",
  fontSize: 14,
  lineHeight: 1.5,
  minHeight: 56,
  direction: "rtl",
};

const ACTION: CSSProperties = {
  background: "transparent",
  color: GREEN_MIST,
  border: `1px solid ${GREEN_MIST}`,
  minHeight: 44,
  minWidth: 72,
  padding: "0 16px",
  borderRadius: 14,
  fontFamily: "var(--font-display-face), var(--font-body), Tahoma, sans-serif",
  fontSize: 14,
  fontWeight: 700,
  marginInlineStart: "auto",
};

const OFFSET = { top: "calc(env(safe-area-inset-top, 0px) + 12px)" };

// Sonner's own stylesheet colours the description grey for light theme; keep it readable on dark.
const EXTRA_CSS = `[data-sonner-toast][data-styled=true] [data-description]{color:rgba(255,255,255,.82);font-size:13px}
[data-sonner-toast][data-styled=true] [data-button]:focus-visible{outline:2px solid ${GREEN_MIST};outline-offset:2px}`;

/** The app's only toast container (mounted by <Providers>). */
export function AppToaster() {
  return (
    <>
      <style>{EXTRA_CSS}</style>
      <Sonner
        position="top-center"
        dir="rtl"
        theme="dark"
        offset={OFFSET}
        mobileOffset={{ ...OFFSET, left: 12, right: 12 }}
        toastOptions={{ style: TOAST, actionButtonStyle: ACTION }}
      />
    </>
  );
}
