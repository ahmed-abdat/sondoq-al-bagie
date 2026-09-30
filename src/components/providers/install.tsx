"use client";
// «ثبّت التطبيق»: one flow for every phone.
// - Chrome's `beforeinstallprompt` is caught by a tiny inline script at the top of <body>
//   (InstallCapture), before any app code loads, and kept on `window.__bip`.
// - The tap calls `prompt()` synchronously in the click handler (user activation), once per event.
// - No dialog available (in-app browser, iPhone, Chrome not ready yet): a sheet with the exact
//   steps, never a dead button.
// - Committee-only app: no invite banner; `InstallEntry` in «المزيد» is the one way in.
import { CopyIcon, DownloadIcon, EllipsisVerticalIcon, ExternalLinkIcon } from "lucide-react";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { toast } from "sonner";
import { Sheet } from "@/components/app/sheet";
import { chromeIntentUrl, installMode, type InstallMode } from "@/lib/offline/install";

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
function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
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

/**
 * Chrome offers its dialog a moment after the page loads (and only after some use of the site),
 * so a tap can come first. Wait for it this long before showing the steps: the tap's activation
 * lasts about 5 s, so prompt() still opens the dialog.
 */
const PROMPT_WAIT_MS = 2500;

/** Resolves true as soon as the browser's install event is here, false after `ms`. */
function waitForPrompt(ms: number): Promise<boolean> {
  if (win().__bip) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = (ok: boolean) => {
      window.removeEventListener(CHANGE, check);
      clearTimeout(t);
      resolve(ok);
    };
    const check = () => win().__bip && done(true);
    const t = window.setTimeout(() => done(false), ms);
    window.addEventListener(CHANGE, check);
  });
}

/** Browsers that can give the install dialog but have not (yet): Chrome/Edge/Samsung, desktop. */
const mayStillPrompt = (m: InstallMode) => m === "android" || m === "samsung" || m === "desktop";

/** Current install mode ("installed" on the server and while hydrating). */
function useInstallMode(): InstallMode {
  return useSyncExternalStore(subscribe, modeNow, () => "installed");
}

/**
 * Mounted once (Providers): asks Android whether the app is already installed, and says thanks
 * when it gets installed.
 */
export function InstallWatcher() {
  useEffect(() => {
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

/**
 * One tap: the browser's dialog when there is one (or when it arrives within a moment), else the
 * steps sheet. After «إلغاء» in the dialog Chrome offers a new event, so the next tap prompts again.
 */
function useInstallAction() {
  const mode = useInstallMode();
  const [sheet, setSheet] = useState<InstallMode | null>(null);
  const [waiting, setWaiting] = useState(false);
  const prompt = (fallback: InstallMode) =>
    void promptInstall().then((o) => o === "unavailable" && setSheet(fallback));
  const start = () => {
    if (waiting) return;
    const fallback = /Android/i.test(navigator.userAgent) ? "android" : "desktop";
    // synchronous in the click: prompt() keeps the tap's user activation
    if (mode === "native") return prompt(fallback);
    if (!mayStillPrompt(mode)) return setSheet(mode);
    setWaiting(true);
    void waitForPrompt(PROMPT_WAIT_MS).then((ok) => {
      setWaiting(false);
      if (ok) prompt(mode);
      else setSheet(mode);
    });
  };
  const sheetEl =
    sheet && sheet !== "installed" && sheet !== "native" ? (
      <InstallSheet mode={sheet} onDone={() => setSheet(null)} />
    ) : null;
  return { mode, start, sheetEl, waiting };
}

/** Quiet permanent entry («تثبيت التطبيق») for a menu or settings list; hidden once installed. */
export function InstallEntry({ className = "" }: { className?: string }) {
  const { mode, start, sheetEl, waiting } = useInstallAction();
  if (mode === "installed") return sheetEl;
  return (
    <>
      <button
        type="button"
        className={`bq-row bq-press ${className}`}
        aria-busy={waiting || undefined}
        onClick={start}
      >
        <span className="bq-disc is-in" aria-hidden>
          <DownloadIcon className="size-5" />
        </span>
        <span className="bq-row-m">
          <span className="bq-row-t">تثبيت التطبيق</span>
          <span className="bq-row-s">أيقونة على الشاشة الرئيسية، يفتح مثل أي تطبيق</span>
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

function InstallSheet({
  mode,
  onDone,
}: {
  mode: Exclude<InstallMode, "installed" | "native">;
  onDone: () => void;
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
              "اختر «تثبيت صندوق الرابطة».",
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
