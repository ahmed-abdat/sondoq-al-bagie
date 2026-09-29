"use client";
// Installed app, no member link yet: «لديك رابط؟ الصقه هنا». On iPhone the home-screen app keeps
// its own cookies, apart from Safari, so the link opened in Safari does not reach it; pasting the
// link here opens /m/<token> inside the app, where the server checks it and sets the cookies.
import { ClipboardPasteIcon } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { hasMemberFlag, memberLinkPath, memberTokenFrom } from "@/lib/member-link";

const noSubscribe = () => () => {};
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function MemberLinkPaste({ className = "" }: { className?: string }) {
  // shown only in the installed app, and only while this device has no member link
  const show = useSyncExternalStore(
    noSubscribe,
    () => isStandalone() && !hasMemberFlag(document.cookie),
    () => false,
  );
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  if (!show) return null;

  const open = (text: string) => {
    const token = memberTokenFrom(text);
    if (!token) return setError(true);
    setError(false);
    window.location.assign(memberLinkPath(token));
  };
  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setValue(text);
      open(text);
    } catch {
      /* no clipboard permission: the field is still there */
    }
  };

  return (
    <section className={`bq-sec ${className}`} aria-labelledby="bq-link-h">
      <h2 id="bq-link-h">لديك رابط من اللجنة؟</h2>
      <p className="bq-hint">الصقه هنا ليعرفك التطبيق.</p>
      <form
        className="bq-small-top"
        onSubmit={(e) => {
          e.preventDefault();
          open(value);
        }}
      >
        <input
          className="bq-input"
          dir="ltr"
          inputMode="url"
          autoComplete="off"
          aria-label="رابطك الخاص"
          placeholder="https://…/m/…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={error}
        />
        {error && (
          <p className="bq-alert bq-small-top" role="alert">
            هذا ليس رابطًا من اللجنة. انسخ الرسالة كما وصلتك على واتساب.
          </p>
        )}
        <div className="bq-btn-col bq-small-top">
          <button type="button" className="bq-btn bq-btn-primary bq-press" onClick={paste}>
            <ClipboardPasteIcon className="size-5" /> الصق الرابط
          </button>
          <button type="submit" className="bq-btn bq-btn-soft bq-press" disabled={!value.trim()}>
            فتح
          </button>
        </div>
      </form>
    </section>
  );
}
