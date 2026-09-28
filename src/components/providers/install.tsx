"use client";

import { DownloadIcon, PlusSquareIcon, ShareIcon, XIcon } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  detectPlatform,
  DISMISS_KEY,
  isDismissed,
  isIosSafari,
  type InstallPlatform,
} from "@/lib/offline/install";
import { safeStorage } from "@/lib/safe-storage";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Chrome fires `beforeinstallprompt` early, often before React hydrates: capture it at load.
let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // we show our own Arabic button instead of the mini-infobar
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    emit();
  });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const mq = window.matchMedia("(display-mode: standalone)");
  mq.addEventListener("change", cb);
  return () => {
    listeners.delete(cb);
    mq.removeEventListener("change", cb);
  };
}

function isStandalone(): boolean {
  return (
    installed ||
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

type InstallState =
  | { kind: "hidden" }
  | { kind: "prompt"; platform: InstallPlatform } // Android/desktop Chrome: native dialog
  | { kind: "ios" }; // iPhone Safari: show the steps

function snapshot(): string {
  if (isStandalone()) return "hidden";
  if (deferred) return "prompt";
  const ua = navigator.userAgent;
  if (detectPlatform(ua, navigator.maxTouchPoints) === "ios" && isIosSafari(ua)) return "ios";
  return "hidden";
}

/**
 * Install state for the current phone. `install()` opens Android's native dialog;
 * on iPhone it returns false so the caller shows the instructions sheet.
 */
export function useInstallPrompt() {
  const kind = useSyncExternalStore(subscribe, snapshot, () => "hidden");
  const state: InstallState =
    kind === "prompt"
      ? { kind, platform: detectPlatform(navigator.userAgent) }
      : kind === "ios"
        ? { kind }
        : { kind: "hidden" };

  async function install(): Promise<boolean> {
    if (!deferred) return false;
    const e = deferred;
    deferred = null;
    await e.prompt();
    const { outcome } = await e.userChoice;
    emit();
    return outcome === "accepted";
  }
  return { state, install };
}

/** iPhone steps: Share → «إضافة إلى الشاشة الرئيسية». */
export function IosInstallSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="bg-surface text-ink" dir="rtl">
        <DrawerHeader className="text-start">
          <DrawerTitle className="font-display text-lg">ثبّت التطبيق على الآيفون</DrawerTitle>
          <DrawerDescription className="text-muted">
            ثلاث خطوات فقط، ثم يفتح من الشاشة الرئيسية مثل أي تطبيق.
          </DrawerDescription>
        </DrawerHeader>
        <ol className="flex flex-col gap-3 px-4 pb-6 text-base">
          <li className="flex items-center gap-3">
            <span className="bg-primary-soft text-primary grid size-9 shrink-0 place-items-center rounded-full font-bold">
              1
            </span>
            <span>
              اضغط زر المشاركة{" "}
              <ShareIcon aria-label="مشاركة" className="inline size-5 align-text-bottom" /> أسفل
              الشاشة في سفاري.
            </span>
          </li>
          <li className="flex items-center gap-3">
            <span className="bg-primary-soft text-primary grid size-9 shrink-0 place-items-center rounded-full font-bold">
              2
            </span>
            <span>
              اختر «إضافة إلى الشاشة الرئيسية»{" "}
              <PlusSquareIcon aria-hidden className="inline size-5 align-text-bottom" />.
            </span>
          </li>
          <li className="flex items-center gap-3">
            <span className="bg-primary-soft text-primary grid size-9 shrink-0 place-items-center rounded-full font-bold">
              3
            </span>
            <span>اضغط «إضافة».</span>
          </li>
        </ol>
      </DrawerContent>
    </Drawer>
  );
}

/**
 * A small card inviting the member to install the app. Renders nothing when already installed,
 * not installable, or dismissed in the last two weeks. Place it where it fits (e.g. home page).
 */
export function InstallCard({ className = "" }: { className?: string }) {
  const { state, install } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(() =>
    typeof window === "undefined" ? true : isDismissed(safeStorage.getItem(DISMISS_KEY)),
  );
  const [iosOpen, setIosOpen] = useState(false);

  if (state.kind === "hidden" || dismissed) return null;

  function dismiss() {
    safeStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  }

  return (
    <div
      className={`border-line bg-surface flex items-center gap-3 rounded-2xl border p-4 ${className}`}
    >
      <DownloadIcon aria-hidden className="text-primary size-6 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">ثبّت التطبيق على هاتفك</p>
        <p className="text-muted text-sm">يفتح بسرعة ويعمل بدون إنترنت بآخر البيانات.</p>
      </div>
      <Button
        className="bg-primary text-primary-ink min-h-11 px-4"
        onClick={() => (state.kind === "ios" ? setIosOpen(true) : void install())}
      >
        تثبيت
      </Button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="ليس الآن"
        className="text-muted grid size-11 shrink-0 place-items-center rounded-full"
      >
        <XIcon className="size-5" />
      </button>
      <IosInstallSheet open={iosOpen} onOpenChange={setIosOpen} />
    </div>
  );
}
