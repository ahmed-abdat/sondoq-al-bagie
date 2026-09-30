"use client";
import { toWesternDigits } from "@/lib/money";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { OfflineWriteHint, useOnline } from "@/components/providers";
import { useAct, useDemoState } from "../act";
import type {
  CommitteeAccount,
  CommitteeRole,
  FundAccountAdmin,
  PaymentMethod,
} from "@/lib/data/types";
import { CommitteeAccounts } from "../accounts-admin";
import { METHOD_LABELS, METHODS, methodLogo } from "@/lib/methods";
import { MethodBadge } from "../bits";
import { ROLE_LABEL } from "../derive";
import { DateField } from "../date-field";
import { I } from "../icons";
import { Sheet } from "../sheet";
import { useSnack } from "../shell";
import { radioKeys, radioTab } from "../radio-keys";

function AddAccountBody({ onDone }: { onDone: (text: string) => void }) {
  const router = useRouter();
  const online = useOnline();
  const { addFundAccount } = useAct();
  const [m, setM] = useState<PaymentMethod | null>(null);
  const [num, setNum] = useState("");
  const [holder, setHolder] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const wallets = METHODS.filter((x) => methodLogo(x));
  const ok = m && /^\d{8,11}$/.test(num) && holder.trim().length > 1;
  return (
    <div className="bq-rec">
      <h2>إضافة رقم</h2>
      <p className="bq-rec-k">المحفظة</p>
      <div className="bq-meth-grid" role="radiogroup" onKeyDown={radioKeys} aria-label="المحفظة">
        {wallets.map((x, i, all) => (
          <button
            key={x}
            type="button"
            role="radio"
            aria-checked={m === x}
            tabIndex={radioTab(
              m === x,
              i,
              all.some((y) => y === m),
            )}
            className="bq-meth-opt bq-press"
            onClick={() => setM(x)}
          >
            <MethodBadge method={x} size={36} label={false} decorative />
            <span>{METHOD_LABELS[x]}</span>
          </button>
        ))}
      </div>
      <p className="bq-rec-k">الرقم</p>
      <input
        className="bq-input"
        value={num}
        onChange={(e) => setNum(toWesternDigits(e.target.value).replace(/[^\d]/g, ""))}
        inputMode="tel"
        dir="ltr"
        aria-label="رقم المحفظة"
      />
      <p className="bq-rec-k">الاسم كما يظهر في المحفظة</p>
      <input
        className="bq-input"
        value={holder}
        onChange={(e) => setHolder(e.target.value)}
        aria-label="اسم صاحب الحساب"
        aria-describedby="bq-holder-hint"
      />
      <p className="bq-hint" id="bq-holder-hint">
        اكتب الاسم كما يظهر في تطبيق المحفظة (بالحروف اللاتينية لسداد ومصرفي)
      </p>
      <div className="bq-rec-foot">
        {err && (
          <p className="bq-alert" role="alert">
            {err}
          </p>
        )}
        <button
          type="button"
          className="bq-btn bq-btn-primary bq-btn-lg bq-press"
          disabled={!ok || busy || !online}
          onClick={async () => {
            if (!m) return;
            setBusy(true);
            const r = await addFundAccount({
              method: m,
              accountNumber: num,
              holderName: holder.trim(),
            });
            setBusy(false);
            if (!r.ok) return setErr(r.message);
            router.refresh();
            onDone(`أُضيف رقم ${METHOD_LABELS[m]}`);
          }}
        >
          أضف الرقم
        </button>
        <OfflineWriteHint />
      </div>
    </div>
  );
}

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

export function SettingsView({
  role,
  displayName,
  whatsapp,
  openingBalance,
  openingBalanceOn,
  accounts,
  committee,
  members,
  selfId,
  children,
}: {
  /** extra cards after «أرقام الصندوق» (year prices, backup) */
  children?: ReactNode;
  role: CommitteeRole;
  displayName: string;
  whatsapp: string | null;
  openingBalance: number;
  /** "YYYY-MM-DD"; null when unknown */
  openingBalanceOn: string | null;
  committee: CommitteeAccount[];
  members: { memberId: string; memberRef: string; fullName: string; status: string }[];
  selfId: string | null;
  accounts: FundAccountAdmin[];
}) {
  const router = useRouter();
  const online = useOnline();
  const { updateFundAccount, updateSettings } = useAct();
  const say = useSnack();
  const [over, setOver] = useState<Record<string, boolean>>({});
  const demoAccounts = useDemoState().accounts;
  const list = [...accounts, ...demoAccounts].map((a) => ({
    ...a,
    active: over[a.id] ?? a.active,
  }));
  const [wa, setWa] = useState(whatsapp ?? "");
  const [savedWa, setSavedWa] = useState(whatsapp ?? "");
  const [opening, setOpening] = useState(String(openingBalance));
  const [savedOpening, setSavedOpening] = useState(openingBalance);
  const yearStart = openingBalanceOn ?? `${new Date().getFullYear()}-01-01`;
  const [openingOn, setOpeningOn] = useState(yearStart);
  const [savedOpeningOn, setSavedOpeningOn] = useState(yearStart);
  const openingNum = Number(opening.replace(/\s/g, "")) || 0;
  const [waSave, setWaSave] = useState<SaveState>(IDLE);
  const [openSave, setOpenSave] = useState<SaveState>(IDLE);
  const [accSave, setAccSave] = useState<Record<string, SaveState>>({});

  const [adding, setAdding] = useState(false);
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

      <section className="bq-sec bq-sec-first" aria-labelledby="bq-wallets-h">
        <h2 id="bq-wallets-h">أرقام الصندوق</h2>
        {!admin && <p className="bq-lead">يغيّرها المسؤول فقط.</p>}
        <ul className="bq-pay">
          {list.map((a) => (
            <li key={a.id} className={a.active ? "" : "is-off"}>
              <MethodBadge method={a.method} size={32} label={false} />
              <span className="bq-row-m">
                <bdi dir="ltr" className="bq-num bq-pay-n">
                  {a.accountNumber}
                </bdi>
                <span className="bq-row-s">
                  باسم {a.holderName} · {a.active ? "مستعمل" : "متوقف"}
                </span>
                <SaveNote s={accSave[a.id] ?? IDLE} />
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={a.active}
                aria-busy={accSave[a.id]?.status === "saving"}
                aria-label={`${METHOD_LABELS[a.method]} ${a.accountNumber}: ${a.active ? "مستعمل" : "متوقف"}`}
                className="bq-mini-switch bq-press"
                disabled={!admin || !online || accSave[a.id]?.status === "saving"}
                onClick={async () => {
                  const next = !a.active;
                  setOver((o) => ({ ...o, [a.id]: next }));
                  const ok = await runSave(
                    (st) => setAccSave((m) => ({ ...m, [a.id]: st })),
                    () =>
                      updateFundAccount({
                        id: a.id,
                        holderName: a.holderName,
                        note: a.note,
                        sortOrder: a.sortOrder,
                        active: next,
                      }),
                  );
                  if (!ok) setOver((o) => ({ ...o, [a.id]: !next }));
                  else router.refresh();
                }}
              >
                <span className="bq-switch-k" aria-hidden="true">
                  <span />
                </span>
              </button>
            </li>
          ))}
        </ul>
        {admin && (
          <button type="button" className="bq-link bq-press" onClick={() => setAdding(true)}>
            {I.plus(18)} إضافة رقم
          </button>
        )}

        <h3 className="bq-h3">رقم واتساب اللجنة</h3>
        <p className="bq-hint">يرسل إليه الأعضاء صورة التحويل.</p>
        <div className="bq-field">
          <label className="bq-search bq-search-s bq-grow-1">
            {I.wa(22)}
            <input
              value={wa}
              onChange={(e) => setWa(toWesternDigits(e.target.value).replace(/[^\d+]/g, ""))}
              inputMode="tel"
              dir="ltr"
              aria-label="رقم واتساب اللجنة"
              aria-describedby="bq-wa-note"
              disabled={!admin}
            />
          </label>
          {admin && wa !== savedWa && (
            <button
              type="button"
              className="bq-btn bq-btn-primary bq-press"
              disabled={!online || waSave.status === "saving"}
              onClick={async () => {
                if (await runSave(setWaSave, () => updateSettings({ whatsappContact: wa }))) {
                  setSavedWa(wa);
                  router.refresh();
                }
              }}
            >
              حفظ
            </button>
          )}
        </div>
        <SaveNote id="bq-wa-note" s={waSave} />

        <h3 className="bq-h3">الرصيد في بداية السنة</h3>
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
          <input
            className="bq-input bq-grow-1"
            value={opening}
            onChange={(e) => setOpening(toWesternDigits(e.target.value).replace(/[^\d\s]/g, ""))}
            inputMode="numeric"
            dir="ltr"
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

      {children}

      {admin && (
        <section className="bq-sec" aria-labelledby="bq-acc-h">
          <h2 id="bq-acc-h">حسابات اللجنة</h2>
          <p className="bq-lead">من يدخل إلى التطبيق، ودور كل واحد.</p>
          <CommitteeAccounts accounts={committee} members={members} selfId={selfId} />
        </section>
      )}

      {adding && (
        <Sheet key="account" label="إضافة رقم" onDone={() => setAdding(false)}>
          <AddAccountBody
            onDone={(t) => {
              setAdding(false);
              say(t);
            }}
          />
        </Sheet>
      )}
    </>
  );
}
