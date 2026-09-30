"use client";
import { AmountInput, amountValue } from "../amount-input";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { InstallEntry, OfflineWriteHint, useOnline } from "@/components/providers";
import { useAct } from "../act";
import type { CommitteeAccount, CommitteeRole } from "@/lib/data/types";
import { CommitteeAccounts } from "../accounts-admin";
import { ROLE_LABEL } from "../derive";
import { DateField } from "../date-field";
import { I } from "../icons";

export type SaveState = { status: "idle" | "saving" | "saved" | "error"; message?: string };
export const IDLE: SaveState = { status: "idle" };

/** Runs one save and reports saving → saved (fades after 2.5 s) or error (stays, with the reason). */
export async function runSave(
  set: (s: SaveState) => void,
  fn: () => Promise<{ ok: true } | { ok: false; message: string }>,
): Promise<boolean> {
  set({ status: "saving" });
  let r: { ok: true } | { ok: false; message: string };
  try {
    r = await fn();
  } catch {
    r = { ok: false, message: "تعذّر الاتصال. تحقّق من الإنترنت وحاول مرة أخرى." };
  }
  if (!r.ok) {
    set({ status: "error", message: `لم يُحفظ: ${r.message}` });
    return false;
  }
  set({ status: "saved" });
  window.setTimeout(() => set(IDLE), 2500);
  return true;
}

/** Inline status under a setting: «جارٍ الحفظ…», «تم الحفظ», or why it failed. */
export function SaveNote({ s, id }: { s: SaveState; id?: string }) {
  return (
    <p
      id={id}
      className={`bq-save is-${s.status}`}
      role={s.status === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      {s.status === "saving" && (
        <>
          <span className="bq-spin" aria-hidden="true" /> جارٍ الحفظ…
        </>
      )}
      {s.status === "saved" && <>{I.check(16)} تم الحفظ</>}
      {s.status === "error" && s.message}
    </p>
  );
}

/** «حسابات اللجنة» («المسؤول» only): who signs in, and their level. */
export function CommitteeSection({
  committee,
  members,
  selfId,
}: {
  committee: CommitteeAccount[];
  members: { memberId: string; memberRef: string; fullName: string; status: string }[];
  selfId: string | null;
}) {
  return (
    <section className="bq-sec" aria-labelledby="bq-acc-h">
      <h2 id="bq-acc-h">حسابات اللجنة</h2>
      <p className="bq-lead">من يدخل إلى التطبيق، ودور كل واحد.</p>
      <CommitteeAccounts accounts={committee} members={members} selfId={selfId} />
    </section>
  );
}

/** «تسليم الصندوق» («المسؤول» only, once per term): the flow has its own page. */
export function HandoverSection() {
  return (
    <section className="bq-sec" aria-labelledby="bq-ho-h">
      <h2 id="bq-ho-h">تسليم الصندوق</h2>
      <p className="bq-lead">للجنة الجديدة عند نهاية الدورة.</p>
      <Link href="/committee/handover" className="bq-btn bq-btn-tonal bq-press">
        افتح التسليم
      </Link>
    </section>
  );
}

/** «تثبيت التطبيق»: nothing once the app is installed. */
export function InstallSection() {
  return (
    <div className="bq-sec">
      <InstallEntry />
    </div>
  );
}

export function SettingsView({
  role,
  displayName,
  openingBalance,
  openingBalanceOn,
  children,
}: {
  /** the sections, in order, before «رصيد أول السنة» */
  children?: ReactNode;
  role: CommitteeRole;
  displayName: string;
  openingBalance: number;
  /** "YYYY-MM-DD"; null when unknown */
  openingBalanceOn: string | null;
}) {
  const router = useRouter();
  const online = useOnline();
  const { updateSettings } = useAct();
  const [opening, setOpening] = useState(String(openingBalance));
  const [savedOpening, setSavedOpening] = useState(openingBalance);
  const yearStart = openingBalanceOn ?? `${new Date().getFullYear()}-01-01`;
  const [openingOn, setOpeningOn] = useState(yearStart);
  const [savedOpeningOn, setSavedOpeningOn] = useState(yearStart);
  const openingNum = amountValue(opening);
  const [openSave, setOpenSave] = useState<SaveState>(IDLE);
  const admin = role === "admin";

  return (
    <>
      <header className="bq-page-h">
        <Link href="/committee/more" className="bq-link bq-link-s bq-press">
          {I.back(18)} المزيد
        </Link>
        <h1>الإعدادات</h1>
        <p className="bq-lead">
          {displayName} · {ROLE_LABEL[role]}
        </p>
      </header>

      {children}

      <section className="bq-sec" aria-labelledby="bq-open-h">
        <h2 id="bq-open-h">رصيد أول السنة</h2>
        <p className="bq-hint">
          رصيد مُرحَّل من السنوات السابقة: ما كان في الصندوق قبل هذا التاريخ، بالأوقية القديمة.
        </p>
        <div className="bq-gap-bottom">
          <DateField
            value={openingOn}
            onChange={setOpeningOn}
            label="تاريخ الرصيد"
            disabled={!admin}
          />
        </div>
        <div className="bq-field">
          <AmountInput
            className="bq-input bq-grow-1"
            value={opening}
            onChange={setOpening}
            aria-label="الرصيد المُرحَّل بالأوقية"
            aria-describedby="bq-open-note"
            disabled={!admin}
          />
          {admin && (openingNum !== savedOpening || openingOn !== savedOpeningOn) && (
            <button
              type="button"
              className="bq-btn bq-btn-primary bq-press"
              disabled={!online || openingNum < 0 || openSave.status === "saving"}
              onClick={async () => {
                if (
                  await runSave(setOpenSave, () =>
                    updateSettings({ openingBalance: openingNum, openingBalanceOn: openingOn }),
                  )
                ) {
                  setSavedOpening(openingNum);
                  setSavedOpeningOn(openingOn);
                  router.refresh();
                }
              }}
            >
              حفظ
            </button>
          )}
        </div>
        <SaveNote id="bq-open-note" s={openSave} />
        <OfflineWriteHint />
      </section>
    </>
  );
}
