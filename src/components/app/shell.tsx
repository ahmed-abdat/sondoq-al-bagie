"use client";
// The app frame: bottom bar (phones) / rail (desktop) with one sliding pill, and snacks.
// Committee-only app (2026-09-30): committee tabs only, until the new layout lands.
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { I } from "./icons";
import { Num } from "./num";
import { usePendingCount } from "./pending-count";

const TABS = [
  { href: "/committee", l: "الرئيسية", i: I.home },
  { href: "/committee/members", l: "الأعضاء", i: I.people },
  { href: "/committee/campaigns", l: "التبرعات", i: I.heart },
  { href: "/committee/reports", l: "التقارير", i: I.book },
  { href: "/committee/settings", l: "الإعدادات", i: I.lock },
] as const;

/** The tab a path belongs to: its own section first, else «الرئيسية» for other /committee pages. */
export function tabIndex(path: string) {
  const i = TABS.findIndex((t, k) => k > 0 && (path === t.href || path.startsWith(`${t.href}/`)));
  if (i > 0) return i;
  return path === "/committee" || path.startsWith("/committee/") ? 0 : -1;
}

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

function NavItems({
  idx,
  badge,
  onGo,
}: {
  idx: number;
  badge?: number;
  onGo: (i: number) => void;
}) {
  return TABS.map((t, i) => (
    <Link
      key={t.href}
      href={t.href}
      className={`bq-nav-i ${idx === i ? "on" : ""}`}
      aria-current={idx === i ? "page" : undefined}
      transitionTypes={[i > idx ? "tab-fwd" : "tab-back"]}
      onClick={() => onGo(i)}
    >
      <span className="bq-nav-ic">
        {t.i(24)}
        {i === 0 && badge ? (
          <Num className="bq-badge">
            <span className="bq-sr">دفعات تحتاج مراجعة: </span>
            {badge}
          </Num>
        ) : null}
      </span>
      <span className="bq-nav-l">{t.l}</span>
    </Link>
  ));
}

export function AppShell({
  badge,
  children,
}: {
  /** pending payments count on the «الرئيسية» tab */
  badge?: number;
  children: ReactNode;
}) {
  const path = usePathname();
  const liveBadge = usePendingCount(badge);
  const real = tabIndex(path);
  // optimistic: the pill starts sliding on tap, before the next page has loaded
  const [tapped, setTapped] = useState<{ from: string; i: number } | null>(null);
  const idx = tapped && tapped.from === path ? tapped.i : real;
  const [snack, say] = useSnackState();

  const onGo = useCallback((i: number) => setTapped({ from: path, i }), [path]);
  const ctx = useMemo(() => say, [say]);

  return (
    <SnackCtx value={ctx}>
      <div className="bq-app">
        <nav
          className="bq-rail"
          aria-label="التنقل"
          style={{ ["--idx" as string]: Math.max(idx, 0) }}
          data-none={idx < 0 || undefined}
        >
          <Image
            src="/logo.jpg"
            alt="شعار رابطة شباب قرية البقيع"
            width={56}
            height={56}
            className="bq-rail-logo"
          />
          <div className="bq-rail-items">
            <span className="bq-pill" aria-hidden="true" />
            <NavItems idx={idx} badge={liveBadge} onGo={onGo} />
          </div>
        </nav>

        <div className="bq-frame">
          <main className="bq-main">{children}</main>
        </div>

        <nav
          className="bq-bnav"
          aria-label="التنقل"
          style={{ ["--idx" as string]: Math.max(idx, 0) }}
          data-none={idx < 0 || undefined}
        >
          <span className="bq-pill" aria-hidden="true" />
          <NavItems idx={idx} badge={liveBadge} onGo={onGo} />
        </nav>

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
      </div>
    </SnackCtx>
  );
}
