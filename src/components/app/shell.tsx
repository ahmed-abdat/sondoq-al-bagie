"use client";
// The app frame: the committee nav (CommitteeShell, owner picks 2026-09-30) and the snacks.
import { createPortal } from "react-dom";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { CommitteeShell } from "@/components/admin/shell";

/* ───────────── snackbar ───────────── */
type Snack = {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
  out?: boolean;
};
type Say = (text: string, action?: Snack["action"]) => void;
const SnackCtx = createContext<Say>(() => {});
/** Show a short message above the nav («نُسخ رقم بنكيلي»). */
export const useSnack = () => useContext(SnackCtx);

function useSnackState() {
  const [snack, setSnack] = useState<Snack | null>(null);
  const say = useCallback<Say>((text, action) => {
    const id = Date.now();
    // long sentences stay long enough to read (audit M12): ~110ms a character, 2.6s to 6s
    const ms = action ? 5000 : Math.max(2600, Math.min(6000, text.length * 110));
    setSnack({ id, text, action });
    window.setTimeout(() => setSnack((s) => (s && s.id === id ? { ...s, out: true } : s)), ms);
    window.setTimeout(() => setSnack((s) => (s && s.id === id ? null : s)), ms + 160);
  }, []);
  return [snack, say] as const;
}

export function AppShell({ children }: { children: ReactNode }) {
  const [snack, say] = useSnackState();
  const ctx = useMemo(() => say, [say]);
  return (
    <SnackCtx value={ctx}>
      <CommitteeShell>{children}</CommitteeShell>
      {/* on <body>, next to the sheet portals: a new snack is never inside the inert
            background of an open sheet, so its action stays tappable */}
      {snack &&
        createPortal(
          <div className={`bq-snack ${snack.out ? "is-out" : ""}`} role="status" key={snack.id}>
            <span>{snack.text}</span>
            {snack.action && (
              <button type="button" className="bq-press" onClick={snack.action.run}>
                {snack.action.label}
              </button>
            )}
          </div>,
          document.body,
        )}
    </SnackCtx>
  );
}
