"use client";
import { toWesternDigits } from "@/lib/money";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CommitteePushToggle } from "@/components/providers/committee-push";
import { useState } from "react";
import { OfflineWriteHint, useOnline } from "@/components/providers";
import { useAct, useDemoState, useIsDemo } from "../act";
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
import { LogoutButton } from "../logout";
import { useSnack } from "../shell";

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
      <div className="bq-meth-grid" role="radiogroup" aria-label="المحفظة">
        {wallets.map((x) => (
          <button
            key={x}
            type="button"
            role="radio"
            aria-checked={m === x}
            className="bq-meth-opt bq-press"
            onClick={() => setM(x)}
          >
            <MethodBadge method={x} size={36} label={false} />
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

type SaveState = { status: "idle" | "saving" | "saved" | "error"; message?: string };
const IDLE: SaveState = { status: "idle" };

/** Runs one save and reports saving → saved (fades after 2.5 s) or error (stays, with the reason). */
async function runSave(
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
function SaveNote({ s, id }: { s: SaveState; id?: string }) {
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
  showOwed,
  whatsapp,
  openingBalance,
  openingBalanceOn,
  accounts,
  committee,
  members,
  selfId,
  canConfirm = false,
}: {
  /** may confirm payments: gets the new-payment notifications switch */
  canConfirm?: boolean;
  role: CommitteeRole;
  displayName: string;
  showOwed: boolean;
  whatsapp: string | null;
  openingBalance: number;
  /** "YYYY-MM-DD"; null when unknown */
  openingBalanceOn: string | null;
  committee: CommitteeAccount[];
  members: { memberId: string; memberRef: string }[];
  selfId: string | null;
  accounts: FundAccountAdmin[];
}) {
  const router = useRouter();
  const online = useOnline();
  const { setPassword, updateFundAccount, updateSettings } = useAct();
  const say = useSnack();
  const [owed, setOwed] = useState(showOwed);
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
  const [confirmOwed, setConfirmOwed] = useState(false);
  const [owedSave, setOwedSave] = useState<SaveState>(IDLE);
  const [waSave, setWaSave] = useState<SaveState>(IDLE);
  const [openSave, setOpenSave] = useState<SaveState>(IDLE);
  const [accSave, setAccSave] = useState<Record<string, SaveState>>({});
  const [pwSave, setPwSave] = useState<SaveState>(IDLE);
  const saveOwed = async (next: boolean) => {
    setOwed(next);
    if (!(await runSave(setOwedSave, () => updateSettings({ showAmountOwed: next }))))
      setOwed(!next);
    else router.refresh();
  };
  const [pw, setPw] = useState("");
  const [adding, setAdding] = useState(false);
  const admin = role === "admin";
  const demo = useIsDemo();

  return (
    <>
      <header className="bq-page-h">
        <Link href="/committee" className="bq-link bq-link-s bq-press">
          {I.back(18)} رجوع إلى اللجنة
        </Link>
        <h1>الإعدادات</h1>
        <p className="bq-lead">
          {displayName} · {ROLE_LABEL[role]}
        </p>
      </header>

      {canConfirm && (
        <section className="bq-sec bq-sec-first" aria-labelledby="bq-push-h">
          <h2 id="bq-push-h">الإشعارات</h2>
          <p className="bq-hint">أعلمني عند وصول دفعة جديدة تنتظر التأكيد، على هذا الهاتف.</p>
          {demo ? (
            <p className="bq-hint">لا تعمل الإشعارات في النسخة التجريبية.</p>
          ) : (
            <CommitteePushToggle className="bq-small-top" />
          )}
        </section>
      )}

      <section className={`bq-sec ${canConfirm ? "" : "bq-sec-first"}`} aria-labelledby="bq-pub-h">
        <h2 id="bq-pub-h">ما يراه الأعضاء</h2>
        {!admin && <p className="bq-lead">يغيّرها المسؤول فقط.</p>}
        {confirmOwed ? (
          <div className="bq-rej" role="group" aria-labelledby="bq-owed-q">
            <p className="bq-rej-l" id="bq-owed-q">
              إظهار المبالغ المتأخرة للجميع؟
            </p>
            <p className="bq-lead">
              سيرى كل من يفتح صفحة الأعضاء المبلغ المتأخر على كل عضو. يمكن إخفاؤه مرة أخرى في أي
              وقت.
            </p>
            <div className="bq-slip-btns bq-small-top">
              <button
                type="button"
                className="bq-btn bq-btn-primary bq-press"
                onClick={() => {
                  setConfirmOwed(false);
                  void saveOwed(true);
                }}
              >
                نعم، أظهرها
              </button>
              <button
                type="button"
                className="bq-btn bq-btn-ghost bq-press"
                onClick={() => setConfirmOwed(false)}
              >
                رجوع
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            role="switch"
            aria-checked={owed}
            aria-describedby="bq-owed-note"
            aria-busy={owedSave.status === "saving"}
            className="bq-switch bq-press"
            disabled={!admin || !online || owedSave.status === "saving"}
            onClick={() => (owed ? void saveOwed(false) : setConfirmOwed(true))}
          >
            <span className="bq-switch-t">
              <strong>إظهار المبالغ المتأخرة</strong>
              <span>
                {owed
                  ? "يرى كل عضو المبلغ المتأخر عليه في صفحته."
                  : "المبالغ مخفية عن الأعضاء. يظهر فقط: منتظم أو متأخر."}
              </span>
            </span>
            <span className="bq-switch-k" aria-hidden="true">
              <span />
            </span>
          </button>
        )}
        <SaveNote id="bq-owed-note" s={owedSave} />

        <h3 className="bq-h3">أرقام الصندوق</h3>
        <ul className="bq-pay">
          {list.map((a) => (
            <li key={a.id} className={a.active ? "" : "is-off"}>
              <MethodBadge method={a.method} size={32} label={false} />
              <span className="bq-row-m">
                <bdi dir="ltr" className="bq-num bq-pay-n">
                  {a.accountNumber}
                </bdi>
                <span className="bq-row-s">
                  باسم {a.holderName} · {a.active ? "ظاهر للأعضاء" : "مخفي"}
                </span>
                <SaveNote s={accSave[a.id] ?? IDLE} />
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={a.active}
                aria-busy={accSave[a.id]?.status === "saving"}
                aria-label={`${METHOD_LABELS[a.method]} ${a.accountNumber}: ${a.active ? "ظاهر للأعضاء" : "مخفي"}`}
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

      {admin && (
        <section className="bq-sec" aria-labelledby="bq-acc-h">
          <h2 id="bq-acc-h">حسابات اللجنة</h2>
          <p className="bq-lead">من يدخل إلى صفحة اللجنة، ودور كل واحد.</p>
          <CommitteeAccounts accounts={committee} members={members} selfId={selfId} />
        </section>
      )}

      {role !== "committee" && (
        <section className="bq-sec" aria-label="نهاية الدورة">
          <ul className="bq-list bq-menu">
            <li>
              <Link
                href="/committee/handover"
                className="bq-row bq-press"
                transitionTypes={["tab-fwd"]}
              >
                <span className="bq-disc">{I.book(22)}</span>
                <span className="bq-row-m">
                  <span className="bq-row-t">تسليم الصندوق للجنة الجديدة</span>
                  <span className="bq-row-s">عند نهاية الدورة فقط</span>
                </span>
                <span className="bq-chev">{I.go(18)}</span>
              </Link>
            </li>
          </ul>
        </section>
      )}

      <section className="bq-sec" aria-labelledby="bq-pw-h">
        <h2 id="bq-pw-h">حسابك</h2>
        <p className="bq-lead">{displayName} · غيّر كلمة السر التي تدخل بها أنت.</p>
        <form
          className="bq-login"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await runSave(setPwSave, () => setPassword({ password: pw }))) setPw("");
          }}
        >
          <label>
            كلمة سر جديدة (8 أحرف أو أكثر)
            <input
              className="bq-input"
              type="password"
              dir="ltr"
              autoComplete="new-password"
              minLength={8}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              required
            />
          </label>
          <button
            type="submit"
            className="bq-btn bq-btn-soft bq-press"
            disabled={!online || pw.length < 8 || pwSave.status === "saving"}
          >
            غيّر كلمة السر
          </button>
          <SaveNote s={pwSave} />
        </form>
        <div className="bq-small-top">
          <LogoutButton className="bq-btn bq-btn-ghost bq-press">
            {I.out2(20)} خروج من حساب اللجنة
          </LogoutButton>
        </div>
      </section>

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
