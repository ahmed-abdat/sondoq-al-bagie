"use client";
import { AmountInput, amountValue } from "../amount-input";
import { toWesternDigits } from "@/lib/money";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { InstallEntry, OfflineWriteHint, useOnline } from "@/components/providers";
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
  const ok = m && /^\d{8,11}$/.test(num);
  return (
    <div className="bq-rec">
      <h2>أضف محفظة</h2>
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
      <p className="bq-rec-k">اسم الحساب (اختياري)</p>
      <input
        className="bq-input"
        value={holder}
        onChange={(e) => setHolder(e.target.value)}
        aria-label="اسم الحساب"
      />
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
              holderName: holder.trim() || "صندوق الرابطة",
            });
            setBusy(false);
            if (!r.ok) return setErr(r.message);
            router.refresh();
            onDone(`أُضيفت محفظة ${METHOD_LABELS[m]}`);
          }}
        >
          أضف المحفظة
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
  accounts,
  children,
}: {
  /** the other sections, in order, after «المحافظ» */
  children?: ReactNode;
  role: CommitteeRole;
  displayName: string;
  openingBalance: number;
  /** "YYYY-MM-DD"; null when unknown */
  openingBalanceOn: string | null;
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
  const [opening, setOpening] = useState(String(openingBalance));
  const [savedOpening, setSavedOpening] = useState(openingBalance);
  const yearStart = openingBalanceOn ?? `${new Date().getFullYear()}-01-01`;
  const [openingOn, setOpeningOn] = useState(yearStart);
  const [savedOpeningOn, setSavedOpeningOn] = useState(yearStart);
  const openingNum = amountValue(opening);
  const [openSave, setOpenSave] = useState<SaveState>(IDLE);
  const [accSave, setAccSave] = useState<Record<string, SaveState>>({});

  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
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
        <h2 id="bq-wallets-h">المحافظ</h2>
        {!admin && <p className="bq-lead">يغيّرها المسؤول فقط.</p>}
        <p className="bq-hint">المحافظ التي تختارها اللجنة عند تسجيل دفعة أو مصروف.</p>
        <ul className="bq-pay">
          {list
            .filter((a) => a.active)
            .map((a) => (
              <li key={a.id}>
                <MethodBadge method={a.method} size={32} label={false} />
                <span className="bq-row-m">
                  <span className="bq-row-t">{METHOD_LABELS[a.method]}</span>
                  <bdi dir="ltr" className="bq-num bq-row-s">
                    {a.accountNumber}
                  </bdi>
                  <SaveNote s={accSave[a.id] ?? IDLE} />
                </span>
                {admin && (
                  <button
                    type="button"
                    className="bq-btn bq-btn-ghost bq-press"
                    disabled={!online || accSave[a.id]?.status === "saving"}
                    onClick={async () => {
                      if (removing !== a.id) return setRemoving(a.id);
                      setRemoving(null);
                      setOver((o) => ({ ...o, [a.id]: false }));
                      const ok = await runSave(
                        (st) => setAccSave((m) => ({ ...m, [a.id]: st })),
                        () =>
                          updateFundAccount({
                            id: a.id,
                            holderName: a.holderName,
                            note: a.note,
                            sortOrder: a.sortOrder,
                            active: false,
                          }),
                      );
                      if (!ok) setOver((o) => ({ ...o, [a.id]: true }));
                      else router.refresh();
                    }}
                  >
                    {removing === a.id ? "نعم، أوقفها" : "أوقف المحفظة"}
                  </button>
                )}
              </li>
            ))}
        </ul>
        {admin && (
          <button type="button" className="bq-link bq-press" onClick={() => setAdding(true)}>
            {I.plus(18)} أضف محفظة
          </button>
        )}
        {list.some((a) => !a.active) && (
          <>
            <h3 className="bq-h3">محافظ متوقفة</h3>
            <p className="bq-hint">لا تظهر عند تسجيل دفعة أو مصروف.</p>
            <ul className="bq-pay">
              {list
                .filter((a) => !a.active)
                .map((a) => (
                  <li key={a.id} className="is-off">
                    <MethodBadge method={a.method} size={32} label={false} />
                    <span className="bq-row-m">
                      <span className="bq-row-t">{METHOD_LABELS[a.method]}</span>
                      <bdi dir="ltr" className="bq-num bq-row-s">
                        {a.accountNumber}
                      </bdi>
                      <SaveNote s={accSave[a.id] ?? IDLE} />
                    </span>
                    {admin && (
                      <button
                        type="button"
                        className="bq-btn bq-btn-soft bq-press"
                        disabled={!online || accSave[a.id]?.status === "saving"}
                        onClick={async () => {
                          setOver((o) => ({ ...o, [a.id]: true }));
                          const ok = await runSave(
                            (st) => setAccSave((m) => ({ ...m, [a.id]: st })),
                            () =>
                              updateFundAccount({
                                id: a.id,
                                holderName: a.holderName,
                                note: a.note,
                                sortOrder: a.sortOrder,
                                active: true,
                              }),
                          );
                          if (!ok) setOver((o) => ({ ...o, [a.id]: false }));
                          else router.refresh();
                        }}
                      >
                        أعِدها
                      </button>
                    )}
                  </li>
                ))}
            </ul>
          </>
        )}

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

      {children}

      {adding && (
        <Sheet key="account" label="أضف محفظة" onDone={() => setAdding(false)}>
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
