"use client";
// «ثبّت التطبيق»: one flow for every phone.
// - Chrome's `beforeinstallprompt` is caught by a tiny inline script at the top of <body>
//   (InstallCapture), before any app code loads, and kept on `window.__bip`.
// - The tap calls `prompt()` synchronously in the click handler (user activation), once per event.
// - No dialog available (in-app browser, iPhone, Chrome not ready yet): a sheet with the exact
//   steps, never a dead button.
// - InstallBanner: a slim bar above the bottom nav, from the second visit or after a meaningful
//   action, once per session, never over an open sheet or while typing; each «✕» pushes the next
//   showing back 1, 3, 7, 14, then 30 days. `InstallEntry` is the quiet permanent entry for menus.
import {
  CopyIcon,
  DownloadIcon,
  EllipsisVerticalIcon,
  ExternalLinkIcon,
  XIcon,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { toast } from "sonner";
import { Sheet } from "@/components/app/sheet";
import {
  BACKOFF_KEY,
  bannerAllowedOn,
  chromeIntentUrl,
  DISMISS_KEY,
  ENGAGED_KEY,
  installMode,
  recordVisitDay,
  SESSIONS_KEY,
  shouldInvite,
  snooze,
  VISITS_KEY,
  type InstallMode,
} from "@/lib/offline/install";
import { safeStorage } from "@/lib/safe-storage";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
type InstallWindow = Window & {
  __bip?: BeforeInstallPromptEvent | null;
  __bipInstalled?: boolean;
  __bipReady?: boolean;
};

const CHANGE = "sondoq:install";

/** Runs while the page is still loading, before React: keeps the install event for later. */
const CAPTURE = `(function(w){if(w.__bipReady)return;w.__bip=null;function n(){w.dispatchEvent(new Event("${CHANGE}"))}w.addEventListener("beforeinstallprompt",function(e){e.preventDefault();w.__bip=e;n()});w.addEventListener("appinstalled",function(){w.__bip=null;w.__bipInstalled=true;n()});w.__bipReady=true})(window);`;

/** Put once, as early as possible (Providers renders it first in <body>). */
export function InstallCapture() {
  return (
    <script
      id="sondoq-install-capture"
      dangerouslySetInnerHTML={{ __html: CAPTURE }}
      suppressHydrationWarning
    />
  );
}

/* ───────────── store (outside React on purpose) ───────────── */

const win = () => window as InstallWindow;
let related = false; // getInstalledRelatedApps said the app is installed
let engagedNow = false;

function emit() {
  window.dispatchEvent(new Event(CHANGE));
}

function subscribe(cb: () => void) {
  window.addEventListener(CHANGE, cb);
  const mq = window.matchMedia("(display-mode: standalone)");
  mq.addEventListener("change", cb);
  return () => {
    window.removeEventListener(CHANGE, cb);
    mq.removeEventListener("change", cb);
  };
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function modeNow(): InstallMode {
  return installMode({
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    standalone: isStandalone(),
    installed: !!win().__bipInstalled || related,
    hasPrompt: !!win().__bip,
  });
}

/**
 * Opens the browser's install dialog. Call it directly in a click handler, before any await.
 * Each event can prompt once; it is dropped here so a second tap never reuses it.
 */
export function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const w = win();
  const event = w.__bip ?? null;
  w.__bip = null;
  if (!event) return Promise.resolve("unavailable");
  let shown: Promise<void>;
  try {
    shown = event.prompt();
  } catch {
    emit();
    return Promise.resolve("unavailable");
  }
  emit();
  return shown.then(
    () => event.userChoice.then((c) => c.outcome),
    () => "unavailable" as const,
  );
}

/** Call after a meaningful action (found one's name, opened a receipt): the invite may show. */
export function markInstallEngaged() {
  engagedNow = true;
  safeStorage.setItem(ENGAGED_KEY, "1");
  emit();
}

function inviteNow(): boolean {
  return shouldInvite({
    visitDays: safeStorage.getItem(VISITS_KEY),
    sessions: Number(safeStorage.getItem(SESSIONS_KEY)) || 0,
    engaged: engagedNow || safeStorage.getItem(ENGAGED_KEY) === "1",
    backoff: safeStorage.getItem(BACKOFF_KEY),
    dismissedAt: safeStorage.getItem(DISMISS_KEY),
  });
}

/** «✕» / «ليس الآن» / the dialog dismissed: next showing after 1, 3, 7, 14, then 30 days. */
function snoozeInvite() {
  safeStorage.setItem(BACKOFF_KEY, snooze(safeStorage.getItem(BACKOFF_KEY)));
  emit();
}

/** sessionStorage, quietly (private modes). */
const session = {
  get(k: string) {
    try {
      return sessionStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      sessionStorage.setItem(k, v);
    } catch {
      /* not remembered: at worst the banner shows again after a reload */
    }
  },
};
const SESSION_SEEN = "sondoq:session";
const BANNER_SHOWN = "sondoq:install-banner-shown";

/** Current install mode ("installed" on the server and while hydrating). */
export function useInstallMode(): InstallMode {
  return useSyncExternalStore(subscribe, modeNow, () => "installed");
}

/**
 * Mounted once (Providers): counts visit days, asks Android whether the app is already installed,
 * and thanks the member when it gets installed.
 */
export function InstallWatcher() {
  useEffect(() => {
    safeStorage.setItem(
      VISITS_KEY,
      recordVisitDay(safeStorage.getItem(VISITS_KEY), new Date().toISOString().slice(0, 10)),
    );
    if (!session.get(SESSION_SEEN)) {
      session.set(SESSION_SEEN, "1");
      const n = (Number(safeStorage.getItem(SESSIONS_KEY)) || 0) + 1;
      safeStorage.setItem(SESSIONS_KEY, String(Math.min(n, 99)));
      emit();
    }
    const nav = navigator as Navigator & {
      getInstalledRelatedApps?: () => Promise<{ platform: string }[]>;
    };
    nav
      .getInstalledRelatedApps?.()
      .then((apps) => {
        if (apps.some((a) => a.platform === "webapp")) {
          related = true;
          emit();
        }
      })
      .catch(() => {});
    const thanks = () =>
      toast("تم تثبيت التطبيق. تجده الآن على الشاشة الرئيسية.", { duration: 5000 });
    window.addEventListener("appinstalled", thanks);
    return () => window.removeEventListener("appinstalled", thanks);
  }, []);
  return null;
}

/* ───────────── UI ───────────── */

/** One tap: the browser's dialog when there is one, else the steps sheet. */
function useInstallAction(onLater?: () => void) {
  const mode = useInstallMode();
  const [sheet, setSheet] = useState<InstallMode | null>(null);
  const start = (onOutcome?: (o: "accepted" | "dismissed") => void) => {
    if (mode === "native") {
      // synchronous in the click: prompt() keeps the tap's user activation
      void promptInstall().then((o) => {
        if (o === "unavailable")
          setSheet(/Android/i.test(navigator.userAgent) ? "android" : "desktop");
        else onOutcome?.(o);
      });
      return;
    }
    setSheet(mode);
  };
  const sheetEl =
    sheet && sheet !== "installed" && sheet !== "native" ? (
      <InstallSheet mode={sheet} onDone={() => setSheet(null)} onLater={onLater} />
    ) : null;
  return { mode, start, sheetEl };
}

/** @deprecated The invite is now the app-wide InstallBanner (Providers); this renders nothing. */
export function InstallCard(props: { className?: string }) {
  void props;
  return null;
}

/* the banner stays away while a sheet/dialog is open or the member is typing */
const TYPING =
  "input:not([type=button]):not([type=checkbox]):not([type=radio]),textarea,select,[contenteditable=true]";
function uiNow(): string {
  const dialog = !!document.querySelector('[role="dialog"],[aria-modal="true"]');
  const typing = !!document.activeElement?.matches(TYPING);
  const nav = document.querySelector<HTMLElement>(".bq-bnav");
  const hasNav = !!nav && getComputedStyle(nav).display !== "none";
  return `${dialog || typing ? 1 : 0}${hasNav ? 1 : 0}`;
}
function subscribeUi(cb: () => void) {
  let raf = 0;
  const later = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(cb);
  };
  const mo = new MutationObserver(later);
  mo.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("focusin", later);
  window.addEventListener("focusout", later);
  window.addEventListener("resize", later);
  return () => {
    cancelAnimationFrame(raf);
    mo.disconnect();
    window.removeEventListener("focusin", later);
    window.removeEventListener("focusout", later);
    window.removeEventListener("resize", later);
  };
}

const BANNER_CSS = `
.bq-ib{position:fixed;inset-inline:12px;bottom:calc(var(--safe-b,0px) + 12px);z-index:45;
max-width:560px;margin-inline:auto;display:flex;align-items:center;gap:10px;
padding-block:8px;padding-inline:12px 6px;background:#fff;color:#14201A;border-radius:18px;
box-shadow:0 12px 30px -12px rgba(14,58,27,.4),0 1px 4px rgba(14,58,27,.14);
animation:bq-ib-in .2s cubic-bezier(.2,.8,.2,1) both}
.bq-ib[data-nav="1"]{bottom:calc(var(--nav,64px) + var(--safe-b,0px) + 8px)}
.bq-ib img{width:36px;height:36px;border-radius:10px;flex:none}
.bq-ib-t{flex:1;min-width:0;font-weight:600;font-size:15px;line-height:1.35}
.bq-ib .bq-btn{min-height:40px;padding-inline:16px;flex:none}
@keyframes bq-ib-in{from{transform:translateY(calc(100% + 24px))}}
@media (prefers-reduced-motion:reduce){.bq-ib{animation:bq-ib-fade .2s both}}
@keyframes bq-ib-fade{from{opacity:0}}
`;

/**
 * The install invite: a slim bar above the bottom nav (mounted once in Providers). It reserves
 * its height at the bottom of the page while visible, so it never covers content.
 */
export function InstallBanner() {
  const pathname = usePathname();
  const ready = useSyncExternalStore(subscribe, inviteNow, () => false);
  const ui = useSyncExternalStore(subscribeUi, uiNow, () => "10");
  // shown already in an earlier page load of this session: not again
  const [seenBefore] = useState(() =>
    typeof window === "undefined" ? true : session.get(BANNER_SHOWN) === "1",
  );
  const [closed, setClosed] = useState(false);
  const later = () => {
    snoozeInvite();
    setClosed(true);
  };
  const { mode, start, sheetEl } = useInstallAction(later);
  const bar = useRef<HTMLDivElement>(null);
  const visible =
    mode !== "installed" &&
    ready &&
    !seenBefore &&
    !closed &&
    ui[0] === "0" &&
    bannerAllowedOn(pathname);

  useEffect(() => {
    if (!visible) return;
    session.set(BANNER_SHOWN, "1");
    const h = (bar.current?.offsetHeight ?? 56) + 12;
    const root = document.documentElement;
    const body = document.body;
    const before = body.style.paddingBottom;
    root.style.setProperty("--bq-install-bar", `${h}px`);
    body.style.paddingBottom = `${h}px`;
    return () => {
      root.style.removeProperty("--bq-install-bar");
      body.style.paddingBottom = before;
    };
  }, [visible]);

  return (
    <>
      {visible && (
        <div
          ref={bar}
          className="bq-ib"
          role="region"
          aria-label="تثبيت التطبيق"
          data-nav={ui[1]}
          dir="rtl"
        >
          <style>{BANNER_CSS}</style>
          {/* eslint-disable-next-line @next/next/no-img-element -- tiny local icon */}
          <img src="/icons/icon-192.png" alt="" />
          <span className="bq-ib-t">ثبّت التطبيق على هاتفك</span>
          <button
            type="button"
            className="bq-btn bq-btn-primary bq-press"
            onClick={() =>
              start((o) => {
                if (o === "dismissed") later();
                else setClosed(true);
              })
            }
          >
            تثبيت
          </button>
          <button
            type="button"
            className="bq-icon-btn bq-press"
            aria-label="ليس الآن"
            onClick={later}
          >
            <XIcon className="size-5" />
          </button>
        </div>
      )}
      {sheetEl}
    </>
  );
}

/** Quiet permanent entry («تثبيت التطبيق») for a menu or settings list; hidden once installed. */
export function InstallEntry({ className = "" }: { className?: string }) {
  const { mode, start, sheetEl } = useInstallAction();
  if (mode === "installed") return sheetEl;
  return (
    <>
      <button type="button" className={`bq-row bq-press ${className}`} onClick={() => start()}>
        <span className="bq-disc is-in" aria-hidden>
          <DownloadIcon className="size-5" />
        </span>
        <span className="bq-row-m">
          <span className="bq-row-t">تثبيت التطبيق</span>
          <span className="bq-row-s">أيقونة على الشاشة الرئيسية، ويعمل بدون إنترنت</span>
        </span>
      </button>
      {sheetEl}
    </>
  );
}

/* ───────────── the steps sheet ───────────── */

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="bq-steps bq-small-top">
      {items.map((t, i) => (
        <li key={i}>
          <span className="bq-step-n">{i + 1}</span>
          <p>{t}</p>
        </li>
      ))}
    </ol>
  );
}

const Dots = () => (
  <EllipsisVerticalIcon aria-label="⋮" className="inline size-5 align-text-bottom" />
);

function CopyLink() {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="bq-btn bq-btn-tonal bq-press"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(location.href);
          setDone(true);
        } catch {
          /* old WebView without clipboard: the steps still say where to go */
        }
      }}
    >
      <CopyIcon className="size-5" /> {done ? "نُسخ الرابط" : "نسخ الرابط"}
    </button>
  );
}

const SHEET: Record<
  Exclude<InstallMode, "installed" | "native">,
  { title: string; lead: string }
> = {
  android: {
    title: "ثبّت التطبيق من Chrome",
    lead: "ثلاث خطوات، ثم يفتح من الشاشة الرئيسية مثل أي تطبيق.",
  },
  samsung: {
    title: "ثبّت التطبيق من متصفح سامسونج",
    lead: "ثلاث خطوات، ثم يفتح من الشاشة الرئيسية مثل أي تطبيق.",
  },
  desktop: {
    title: "ثبّت التطبيق على الحاسوب",
    lead: "من قائمة المتصفح، أو من رمز التثبيت في شريط العنوان.",
  },
  "in-app": {
    title: "افتح الرابط في المتصفح",
    lead: "هذه الصفحة مفتوحة داخل تطبيق آخر (واتساب أو فيسبوك…)، ولا يمكن التثبيت منه.",
  },
  ios: {
    title: "ثبّت التطبيق على الآيفون",
    lead: "ثلاث خطوات في سفاري، ثم يفتح من الشاشة الرئيسية مثل أي تطبيق.",
  },
  "ios-other": {
    title: "افتح الرابط في سفاري",
    lead: "على الآيفون يُثبَّت التطبيق من سفاري فقط.",
  },
};

export function InstallSheet({
  mode,
  onDone,
  onLater,
}: {
  mode: Exclude<InstallMode, "installed" | "native">;
  onDone: () => void;
  /** Adds «ليس الآن» (snoozes the invite). */
  onLater?: () => void;
}) {
  const s = SHEET[mode];
  const android = /Android/i.test(navigator.userAgent);
  return (
    <Sheet label={s.title} onDone={onDone}>
      <div className="bq-rec" dir="rtl">
        <h2>{s.title}</h2>
        <p className="bq-lead">{s.lead}</p>
        {mode === "android" && (
          <>
            <AndroidMenuArt />
            <Steps
              items={[
                <>
                  اضغط النقاط الثلاث <Dots /> بجانب شريط العنوان، أعلى الشاشة.
                </>,
                "اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».",
                "اضغط «تثبيت».",
              ]}
            />
            <p className="bq-hint bq-small-top">
              فتحت الرابط من واتساب؟ اضغط <Dots /> ثم «فتح في Chrome» أولًا.
            </p>
          </>
        )}
        {mode === "samsung" && (
          <Steps
            items={[
              "اضغط ☰ أسفل الشاشة.",
              "اختر «إضافة صفحة إلى» ثم «الشاشة الرئيسية».",
              "اضغط «إضافة».",
            ]}
          />
        )}
        {mode === "desktop" && (
          <Steps
            items={[
              <>
                افتح قائمة المتصفح <Dots /> أعلى النافذة.
              </>,
              "اختر «تثبيت صندوق الشباب».",
              "اضغط «تثبيت».",
            ]}
          />
        )}
        {mode === "in-app" && (
          <>
            <Steps
              items={
                android
                  ? ["اضغط «فتح في Chrome» هنا.", "ثم اضغط «تثبيت» في Chrome."]
                  : [
                      "اضغط ⋯ أو رمز البوصلة أسفل الشاشة، ثم «فتح في سفاري».",
                      "أو انسخ الرابط والصقه في سفاري.",
                    ]
              }
            />
            <div className="bq-btn-col bq-small-top">
              {android && (
                <a className="bq-btn bq-btn-primary bq-press" href={chromeIntentUrl(location.href)}>
                  <ExternalLinkIcon className="size-5" /> فتح في Chrome
                </a>
              )}
              <CopyLink />
            </div>
          </>
        )}
        {mode === "ios" && (
          <>
            <IosShareArt />
            <Steps
              items={[
                "اضغط زر المشاركة (مربع وسهم للأعلى) أسفل الشاشة.",
                "مرّر للأسفل واختر «إضافة إلى الشاشة الرئيسية».",
                "اضغط «إضافة».",
              ]}
            />
          </>
        )}
        {mode === "ios-other" && (
          <>
            <Steps
              items={[
                "انسخ الرابط من هنا.",
                "افتح سفاري والصق الرابط.",
                "ثم اضغط زر المشاركة واختر «إضافة إلى الشاشة الرئيسية».",
              ]}
            />
            <div className="bq-btn-col bq-small-top">
              <CopyLink />
            </div>
          </>
        )}
        {onLater && (
          <button
            type="button"
            className="bq-btn bq-btn-ghost bq-press bq-small-top"
            onClick={() => {
              onLater();
              onDone();
            }}
          >
            ليس الآن
          </button>
        )}
      </div>
    </Sheet>
  );
}

/* ───────────── illustrations (RTL, like the Arabic phone UI) ───────────── */

const G = "#237A3B";
const MIST = "#F2F4F3";
const STONE = "#E8ECEA";
const INK = "#14201A";
const SLATE = "#4F5C55";

/** Chrome's toolbar (⋮ at the end of the address bar) and its menu with «تثبيت التطبيق». */
function AndroidMenuArt() {
  return (
    <svg
      viewBox="0 0 320 188"
      role="img"
      aria-label="قائمة Chrome: النقاط الثلاث ثم «تثبيت التطبيق»"
      className="bq-small-top"
      style={{ width: "100%", maxWidth: 360, height: "auto" }}
    >
      <rect x="0" y="0" width="320" height="188" rx="18" fill={MIST} />
      {/* toolbar */}
      <rect x="54" y="14" width="252" height="34" rx="17" fill="#fff" />
      <text x="290" y="36" fontSize="13" fill={SLATE} textAnchor="end" direction="ltr">
        sondoq-al-bagie…
      </text>
      <circle cx="30" cy="31" r="17" fill="none" stroke={G} strokeWidth="3" />
      {[24, 31, 38].map((y) => (
        <circle key={y} cx="30" cy={y} r="2.4" fill={INK} />
      ))}
      <text x="30" y="66" fontSize="12" fill={G} textAnchor="middle" fontWeight="700">
        1
      </text>
      {/* menu */}
      <rect x="14" y="74" width="190" height="104" rx="12" fill="#fff" />
      <text x="190" y="98" fontSize="13" fill={SLATE} textAnchor="start" direction="rtl">
        علامة تبويب جديدة
      </text>
      <text x="190" y="124" fontSize="13" fill={SLATE} textAnchor="start" direction="rtl">
        السجل
      </text>
      <rect x="22" y="134" width="174" height="34" rx="10" fill={STONE} />
      <rect
        x="22"
        y="134"
        width="174"
        height="34"
        rx="10"
        fill="none"
        stroke={G}
        strokeWidth="2.5"
      />
      <text
        x="186"
        y="156"
        fontSize="14"
        fill={INK}
        textAnchor="start"
        fontWeight="700"
        direction="rtl"
      >
        تثبيت التطبيق
      </text>
      <text x="214" y="156" fontSize="12" fill={G} textAnchor="middle" fontWeight="700">
        2
      </text>
    </svg>
  );
}

/** Safari's bottom bar (share button) and the share list with «إضافة إلى الشاشة الرئيسية». */
function IosShareArt() {
  return (
    <svg
      viewBox="0 0 320 188"
      role="img"
      aria-label="سفاري: زر المشاركة ثم «إضافة إلى الشاشة الرئيسية»"
      className="bq-small-top"
      style={{ width: "100%", maxWidth: 360, height: "auto" }}
    >
      <rect x="0" y="0" width="320" height="188" rx="18" fill={MIST} />
      {/* share list */}
      <rect x="40" y="14" width="240" height="96" rx="12" fill="#fff" />
      <text x="266" y="40" fontSize="13" fill={SLATE} textAnchor="start" direction="rtl">
        نسخ
      </text>
      <rect x="48" y="54" width="224" height="40" rx="10" fill={STONE} />
      <rect
        x="48"
        y="54"
        width="224"
        height="40"
        rx="10"
        fill="none"
        stroke={G}
        strokeWidth="2.5"
      />
      <text
        x="258"
        y="79"
        fontSize="14"
        fill={INK}
        textAnchor="start"
        fontWeight="700"
        direction="rtl"
      >
        إضافة إلى الشاشة الرئيسية
      </text>
      <rect x="62" y="64" width="20" height="20" rx="5" fill="none" stroke={INK} strokeWidth="2" />
      <path d="M72 69v10M67 74h10" stroke={INK} strokeWidth="2" strokeLinecap="round" />
      <text x="26" y="79" fontSize="12" fill={G} textAnchor="middle" fontWeight="700">
        2
      </text>
      {/* bottom bar */}
      <rect x="14" y="132" width="292" height="44" rx="14" fill="#fff" />
      {[60, 110, 210, 260].map((x) => (
        <circle key={x} cx={x} cy="154" r="4" fill={STONE} />
      ))}
      <circle cx="160" cy="154" r="19" fill="none" stroke={G} strokeWidth="3" />
      <path
        d="M154 152v10h12v-10M160 144v12M155 149l5-5 5 5"
        fill="none"
        stroke={INK}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text x="160" y="126" fontSize="12" fill={G} textAnchor="middle" fontWeight="700">
        1
      </text>
    </svg>
  );
}
