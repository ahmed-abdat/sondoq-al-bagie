"use client";
// The app frame: bottom bar (phones) / rail (desktop) with one sliding pill, the balance panel
// in the desktop aside, the compact balance bar on the mobile home, section reveal and snacks.
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
import { I } from "./icons";
import { Num, prefersReduced, Roll } from "./num";

const TABS = [
  { href: "/", l: "الرئيسية", i: I.home },
  { href: "/members", l: "الأعضاء", i: I.people },
  { href: "/accounts", l: "الحسابات", i: I.book },
  { href: "/donations", l: "التبرعات", i: I.heart },
  { href: "/committee", l: "اللجنة", i: I.lock },
] as const;

export function tabIndex(path: string) {
  if (path === "/") return 0;
  const i = TABS.findIndex((t) => t.href !== "/" && (path === t.href || path.startsWith(`${t.href}/`)));
  return i < 0 ? 0 : i;
}

/* ───────────── snackbar ───────────── */
type Snack = { id: number; text: string; action?: { label: string; run: () => void }; out?: boolean };
type Say = (text: string, action?: Snack["action"]) => void;
const SnackCtx = createContext<Say>(() => {});
/** Show a short message above the nav («نُسخ رقم بنكيلي»). */
export const useSnack = () => useContext(SnackCtx);

function useSnackState() {
  const [snack, setSnack] = useState<Snack | null>(null);
  const say = useCallback<Say>((text, action) => {
    const id = Date.now();
    const ms = action ? 5000 : 2600;
    setSnack({ id, text, action });
    window.setTimeout(() => setSnack((s) => (s && s.id === id ? { ...s, out: true } : s)), ms);
    window.setTimeout(() => setSnack((s) => (s && s.id === id ? null : s)), ms + 160);
  }, []);
  return [snack, say] as const;
}

/* ───────────── reveal: below the fold only, once per session, 300ms, no blur ───────────── */
const REVEALED = new Set<string>();
function useReveal(root: React.RefObject<HTMLElement | null>, key: string) {
  const first = useRef(true);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const secs = [...el.querySelectorAll<HTMLElement>(".bq-rv")];
    const reduce = prefersReduced();
    const isFirst = first.current;
    first.current = false;
    let n = 0;
    const io =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            (ens) =>
              ens.forEach((en) => {
                if (!en.isIntersecting) return;
                const t = en.target as HTMLElement;
                t.style.transitionDelay = `${(n++ % 3) * 40}ms`;
                t.classList.add("in");
                REVEALED.add(t.dataset.rv ?? "");
                io?.unobserve(t);
              }),
            { rootMargin: "0px 0px -6% 0px" },
          );
    secs.forEach((s) => {
      const k = s.dataset.rv ?? "";
      const above = s.getBoundingClientRect().top < window.innerHeight;
      if (reduce || !io || REVEALED.has(k) || above) {
        s.classList.add(isFirst && above && !reduce ? "in" : "seen");
        s.style.transitionDelay = "0ms";
        REVEALED.add(k);
      } else {
        s.classList.add("hide");
        io.observe(s);
      }
    });
    el.dataset.rv = "1";
    return () => io?.disconnect();
  }, [root, key]);
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

function NavItems({ idx, badge, onGo }: { idx: number; badge?: number; onGo: (i: number) => void }) {
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
  const real = tabIndex(path);
  // optimistic: the pill starts sliding on tap, before the next page has loaded
  const [tapped, setTapped] = useState<{ from: string; i: number } | null>(null);
  const idx = tapped && tapped.from === path ? tapped.i : real;
  const [snack, say] = useSnackState();
  const main = useRef<HTMLElement>(null);
  useReveal(main, path);
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
          <span className="bq-compact-n">
            <Roll value={hero.balance} /> <small>أوقية</small>
          </span>
        </div>

        <nav className="bq-rail" aria-label="التنقل" style={{ ["--idx" as string]: idx }}>
          <Image
            src="/logo.jpg"
            alt="شعار رابطة شباب قرية البقيع"
            width={56}
            height={56}
            className="bq-rail-logo"
          />
          <div className="bq-rail-items">
            <span className="bq-pill" aria-hidden="true" />
            <NavItems idx={idx} badge={badge} onGo={onGo} />
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

        <nav className="bq-bnav" aria-label="التنقل" style={{ ["--idx" as string]: idx }}>
          <span className="bq-pill" aria-hidden="true" />
          <NavItems idx={idx} badge={badge} onGo={onGo} />
        </nav>

        {snack && (
          <div className={`bq-snack ${snack.out ? "is-out" : ""}`} role="status" key={snack.id}>
            <span>{snack.text}</span>
            {snack.action && (
              <button type="button" className="bq-press" onClick={snack.action.run}>
                {snack.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </SnackCtx>
  );
}
