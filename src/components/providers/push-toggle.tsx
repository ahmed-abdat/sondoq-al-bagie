"use client";
// A notifications switch for this phone: the committee's «إشعارات الدفعات الجديدة» or the
// member's «إشعارات دفعاتي». Never asks the browser for permission without a tap.
import { useEffect, useState } from "react";
import {
  pushState,
  subscribePush,
  unsubscribePush,
  type PushKind,
  type PushState,
  type PushSubscriptionData,
} from "@/lib/push";

const COMMON: Record<Exclude<PushState, "on" | "off">, string> = {
  denied: "الإشعارات محظورة لهذا الموقع. فعّلها من إعدادات المتصفح ثم عد إلى هنا.",
  "install-first": "ثبّت التطبيق أولًا لتصلك الإشعارات على الآيفون.",
  unsupported: "هذا المتصفح لا يدعم الإشعارات.",
};
const TEXT: Record<PushKind, { title: string; on: string; off: string }> = {
  committee: {
    title: "إشعارات الدفعات الجديدة",
    on: "يصلك تنبيه على هذا الهاتف حين يسجّل أحد اللجنة دفعة أو مصروفًا.",
    off: "فعّلها ليصلك تنبيه حين يسجّل أحد اللجنة دفعة أو مصروفًا.",
  },
  member: {
    title: "إشعارات دفعاتي",
    on: "يصلك تنبيه على هذا الهاتف عند تأكيد دفعتك أو رفضها.",
    off: "فعّلها ليصلك تنبيه عند تأكيد دفعتك أو رفضها.",
  },
};

export function PushToggle({
  save,
  remove,
  kind = "committee",
  className = "",
}: {
  save: (s: PushSubscriptionData) => Promise<{ ok: boolean }>;
  remove: (endpoint: string) => Promise<{ ok: boolean }>;
  kind?: PushKind;
  className?: string;
}) {
  const text = TEXT[kind];
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    const read = () => void pushState(kind).then((s) => alive && setState(s));
    read();
    // coming back from the browser settings
    document.addEventListener("visibilitychange", read);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", read);
    };
  }, [kind]);

  const on = state === "on";
  const usable = state === "on" || state === "off";
  const toggle = async () => {
    setBusy(true);
    setError(false);
    const next = on ? await unsubscribePush(remove, kind) : await subscribePush(save, kind);
    if (next === "error") setError(true);
    else setState(next);
    setBusy(false);
  };

  return (
    <div className={className}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        className="bq-switch bq-press"
        disabled={!usable || busy}
        aria-busy={busy}
        onClick={toggle}
      >
        <span className="bq-switch-t">
          <strong>{text.title}</strong>
          <span>
            {state === "on" || state === "off" ? text[state] : state ? COMMON[state] : "…"}
          </span>
        </span>
        <span className="bq-switch-k" aria-hidden>
          <span />
        </span>
      </button>
      {error && (
        <p className="bq-alert bq-small-top" role="alert">
          تعذّر تغيير الإشعارات الآن. تأكد من الاتصال وحاول مرة أخرى.
        </p>
      )}
    </div>
  );
}
