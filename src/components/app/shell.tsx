"use client";
// The app frame: bottom bar (phones) / rail (desktop) with one sliding pill, the balance panel
// in the desktop aside, the compact balance bar on the mobile home, section reveal and snacks.
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Hero, type HeroData } from "./hero";
import { Dots, useMoney } from "./money";
import { I } from "./icons";
import { Num, Roll } from "./num";
import { usePendingCount } from "./pending-count";

const TABS = [
  { href: "/", l: "الرئيسية", i: I.home },
  { href: "/members", l: "الأعضاء", i: I.people },
  { href: "/accounts", l: "الحسابات", i: I.book },
  { href: "/donations", l: "التبرعات", i: I.heart },
  { href: "/committee", l: "اللجنة", i: I.lock },
] as const;

/** The tab a path belongs to, or -1 (e.g. «دفعاتي» /me): then no tab claims to be current. */
export function tabIndex(path: string) {
  if (path === "/") return 0;
  return TABS.findIndex(
    (t) => t.href !== "/" && (path === t.href || path.startsWith(`${t.href}/`)),
  );
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

/* ───────────── reveal ───────────── */
/**
 * Sections used to slide in on scroll; routine content now shows at once, still (QA pass 3:
 * nothing moves while someone reads money). Kept as the one hook so pages need no change.
 */
function reveal(el: HTMLElement) {
  el.querySelectorAll<HTMLElement>(".bq-rv").forEach((s) => s.classList.add("seen"));
  return () => {};
}

/* ───────────── compact bar: the hero, collapsed, once its balance leaves (mobile home) ───────────── */
function useCompact(active: boolean) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!active) return;
    const el = document.querySelector("[data-hero-bal]");
    if (!el) return;
    const io = new IntersectionObserver(
      ([en]) => setOn(!en.isIntersecting && en.boundingClientRect.top < 0),
      { threshold: 0 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      setOn(false);
    };
  }, [active]);
  return active && on;
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
        {i === 4 && badge ? (
          <Num className="bq-badge">
            <span className="bq-sr">بانتظار التأكيد: </span>
            {badge}
          </Num>
        ) : null}
      </span>
      <span className="bq-nav-l">{t.l}</span>
    </Link>
  ));
}

export function AppShell({
  hero,
  badge,
  children,
}: {
  hero: HeroData;
  /** committee: pending payments count on the «اللجنة» tab */
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
  const main = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (!main.current) return;
    const cleanup = reveal(main.current);
    return cleanup;
  }, [path]);
  const compact = useCompact(path === "/");

  const onGo = useCallback((i: number) => setTapped({ from: path, i }), [path]);
  const ctx = useMemo(() => say, [say]);

  return (
    <SnackCtx value={ctx}>
      <div className="bq-app">
        <div className={`bq-compact ${compact ? "is-on" : ""}`} aria-hidden={!compact}>
          <span className="bq-logo bq-logo-s">
            <Image src="/logo.jpg" alt="" width={64} height={64} />
          </span>
          <span className="bq-compact-l">في الصندوق الآن</span>
          <CompactBalance />
        </div>

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
          <main className="bq-main" ref={main}>
            {children}
          </main>
          <aside className="bq-aside" aria-label="رصيد الصندوق">
            <Hero data={hero} variant="panel" />
            {real !== 2 && (
              <Link href="/accounts#bq-sum" className="bq-link bq-press bq-aside-link">
                كيف حُسب الرصيد؟ {I.go(18)}
              </Link>
            )}
          </aside>
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

/** The compact bar's figure: the balance for members and the committee, «•••» otherwise. */
function CompactBalance() {
  const m = useMoney();
  return (
    <span className="bq-compact-n">
      {m ? <Roll value={m.summary.balance} /> : <Dots />} <small>أوقية</small>
    </span>
  );
}
