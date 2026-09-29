"use client";
// One calm, one-time card on the committee hub for members who confirm payments: turn on
// new-payment notifications. «✕» hides it on this phone for good. Not shown in demo mode.
import { useEffect, useState } from "react";
import { pushState, subscribePush } from "@/lib/push";
import { safeStorage } from "@/lib/safe-storage";
import { useAct, useIsDemo } from "./act";
import { I } from "./icons";
import { useSnack } from "./shell";

const KEY = "bq-push-suggest-done";

export function PushSuggest() {
  const demo = useIsDemo();
  const { savePushSubscription } = useAct();
  const say = useSnack();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (demo || safeStorage.getItem(KEY)) return;
    let alive = true;
    void pushState().then((s) => alive && setShow(s === "off"));
    return () => {
      alive = false;
    };
  }, [demo]);
  if (!show) return null;
  const done = () => {
    safeStorage.setItem(KEY, "1");
    setShow(false);
  };
  return (
    <aside className="bq-suggest" aria-label="الإشعارات">
      <span className="bq-suggest-i" aria-hidden="true">
        {I.clock(22)}
      </span>
      <div className="bq-suggest-m">
        <p className="bq-suggest-t">فعّل الإشعارات لتعرف فور وصول دفعة</p>
        <button
          type="button"
          className="bq-btn bq-btn-soft bq-press"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const s = await subscribePush((d) =>
              savePushSubscription({ ...d, userAgent: navigator.userAgent.slice(0, 300) }),
            )
              .catch(() => "error" as const)
              .finally(() => setBusy(false));
            if (s === "on") {
              say("فُعّلت الإشعارات على هذا الهاتف");
              done();
            } else if (s === "denied") {
              say("الإشعارات محظورة. فعّلها من إعدادات المتصفح.");
              done();
            } else if (s === "error") say("تعذّر تفعيل الإشعارات الآن. حاول لاحقًا من الإعدادات.");
          }}
        >
          {busy ? "جارٍ التفعيل…" : "فعّل الإشعارات"}
        </button>
      </div>
      <button type="button" className="bq-suggest-x bq-press" onClick={done} aria-label="إخفاء">
        {I.x(20)}
      </button>
    </aside>
  );
}
