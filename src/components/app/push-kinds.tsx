"use client";
// «أعلمني عن»: which committee events reach this phone (m29 set_push_kinds). Kept on the phone
// too, so the choice shows again next time; sent to the server for this device's subscription.
import { useState } from "react";
import { useOnline } from "@/components/providers";
import { PUSH_KINDS, type PushKind } from "@/lib/data/schemas";
import { safeStorage } from "@/lib/safe-storage";
import { useAct } from "./act";

const LABEL: Record<PushKind, string> = {
  payment: "دفعة سُجّلت",
  expense: "مصروف سُجّل",
  contribution: "مساهمة في تبرع",
  levy: "لوحة جديدة",
  cancel: "دفعة أو مصروف أُلغي",
  member: "عضو أُضيف أو تغيّرت بياناته",
};
const KEY = "sondoq:event-kinds";

function saved(): PushKind[] {
  const v = safeStorage.getItem(KEY);
  if (v === null) return [...PUSH_KINDS];
  return v.split(",").filter((k): k is PushKind => (PUSH_KINDS as readonly string[]).includes(k));
}

async function endpoint(): Promise<string | undefined> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    return (await reg?.pushManager.getSubscription())?.endpoint;
  } catch {
    return undefined;
  }
}

export function PushKinds() {
  const online = useOnline();
  const { setPushKinds } = useAct();
  const [kinds, setKinds] = useState<PushKind[]>(saved);
  const [msg, setMsg] = useState("");
  const toggle = async (k: PushKind) => {
    const next = kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k];
    setKinds(next);
    safeStorage.setItem(KEY, next.join(","));
    setMsg("");
    const ep = await endpoint();
    if (!ep) return setMsg("فعّل الإشعارات أولًا، ثم اختر.");
    const r = await setPushKinds({ endpoint: ep, kinds: next }).catch(() => null);
    setMsg(r?.ok ? "حُفظ." : (r?.message ?? "لم يُحفظ. حاول مرة أخرى."));
  };
  return (
    <fieldset className="bq-kinds">
      <legend className="bq-rej-l">أعلمني عن</legend>
      {PUSH_KINDS.map((k) => (
        <label key={k} className="bq-kind-check">
          <input
            type="checkbox"
            checked={kinds.includes(k)}
            disabled={!online}
            onChange={() => void toggle(k)}
          />
          <span>{LABEL[k]}</span>
        </label>
      ))}
      {msg && (
        <p className="bq-hint" role="status">
          {msg}
        </p>
      )}
    </fieldset>
  );
}
