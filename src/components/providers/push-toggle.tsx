"use client";
// «إشعارات الدفعات الجديدة» on/off for a committee member's phone. Place it in committee settings,
// passing Lane A's server actions. Never asks the browser for permission without a tap.
import { useEffect, useState } from "react";
import {
  pushState,
  subscribePush,
  unsubscribePush,
  type PushState,
  type PushSubscriptionData,
} from "@/lib/push";

const SUB: Record<PushState, string> = {
  on: "يصلك تنبيه على هذا الهاتف عند وصول دفعة تنتظر التأكيد.",
  off: "فعّلها ليصلك تنبيه عند وصول دفعة تنتظر التأكيد.",
  denied: "الإشعارات محظورة لهذا الموقع. فعّلها من إعدادات المتصفح ثم عد إلى هنا.",
  "install-first": "ثبّت التطبيق أولًا لتصلك الإشعارات على الآيفون.",
  unsupported: "هذا المتصفح لا يدعم الإشعارات.",
};

export function PushToggle({
  save,
  remove,
  className = "",
}: {
  save: (s: PushSubscriptionData) => Promise<{ ok: boolean }>;
  remove: (endpoint: string) => Promise<{ ok: boolean }>;
  className?: string;
}) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    const read = () => void pushState().then((s) => alive && setState(s));
    read();
    // coming back from the browser settings
    document.addEventListener("visibilitychange", read);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", read);
    };
  }, []);

  const on = state === "on";
  const usable = state === "on" || state === "off";
  const toggle = async () => {
    setBusy(true);
    setError(false);
    const next = on ? await unsubscribePush(remove) : await subscribePush(save);
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
          <strong>إشعارات الدفعات الجديدة</strong>
          <span>{state ? SUB[state] : "…"}</span>
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
