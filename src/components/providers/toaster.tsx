"use client";

import type { CSSProperties } from "react";
import { Toaster as Sonner } from "sonner";

// Self-contained toast look: explicit colours with fallbacks, so a toast can never render
// transparent (the shadcn wrapper relied on --popover/--border/--radius, which no longer exist).
// White card, ink text, green-tinted shadow; the action is a filled green button ≥ 44px.
const TOAST: CSSProperties = {
  background: "var(--paper, #ffffff)",
  color: "var(--ink, #14201a)",
  border: "1px solid rgba(14, 58, 27, 0.08)",
  borderRadius: 18,
  boxShadow:
    "var(--sh-snack, 0 14px 30px -14px rgba(14, 58, 27, 0.55)), 0 2px 8px rgba(14, 58, 27, 0.12)",
  padding: "12px 14px",
  gap: 12,
  fontFamily: "var(--font-body), Tahoma, sans-serif",
  fontSize: 15,
  lineHeight: 1.5,
  minHeight: 56,
  direction: "rtl",
};

const ACTION: CSSProperties = {
  background: "var(--primary, #1a5f2e)",
  color: "var(--primary-ink, #ffffff)",
  minHeight: 44,
  minWidth: 72,
  padding: "0 16px",
  borderRadius: 14,
  fontFamily: "var(--font-display-face), var(--font-body), Tahoma, sans-serif",
  fontSize: 15,
  fontWeight: 700,
  marginInlineStart: "auto",
};

const OFFSET = { top: "calc(env(safe-area-inset-top, 0px) + 12px)" };

/** The app's only toast container (mounted by <Providers>). */
export function AppToaster() {
  return (
    <Sonner
      position="top-center"
      dir="rtl"
      theme="light"
      offset={OFFSET}
      mobileOffset={{ ...OFFSET, left: 12, right: 12 }}
      toastOptions={{
        style: TOAST,
        actionButtonStyle: ACTION,
      }}
    />
  );
}
