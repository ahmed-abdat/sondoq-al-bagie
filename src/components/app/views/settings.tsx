"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { OfflineWriteHint, useOnline } from "@/components/providers";
import { useAct, useDemoState } from "../act";
import type { CommitteeRole, FundAccountAdmin, PaymentMethod } from "@/lib/data/types";
import { METHOD_LABELS, METHODS, methodLogo } from "@/lib/methods";
import { MethodBadge } from "../bits";
import { ROLE_LABEL } from "../derive";
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
        onChange={(e) => setNum(e.target.value.replace(/[^\d]/g, ""))}
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

export function SettingsView({
  role,
  displayName,
  showOwed,
  whatsapp,
  accounts,
}: {
  role: CommitteeRole;
  displayName: string;
  showOwed: boolean;
  whatsapp: string | null;
  accounts: FundAccountAdmin[];
}) {
  const router = useRouter();
  const online = useOnline();
  const { inviteCommitteeMember, setPassword, updateFundAccount, updateSettings } = useAct();
  const say = useSnack();
  const [owed, setOwed] = useState(showOwed);
  const [over, setOver] = useState<Record<string, boolean>>({});
  const demoAccounts = useDemoState().accounts;
  const list = [...accounts, ...demoAccounts].map((a) => ({
    ...a,
    active: over[a.id] ?? a.active,
  }));
  const [wa, setWa] = useState(whatsapp ?? "");
  const [pw, setPw] = useState("");
  const [inv, setInv] = useState({ email: "", name: "", role: "committee" as CommitteeRole });
  const [adding, setAdding] = useState(false);
  const admin = role === "admin";

  const fail = (msg: string) => say(msg);

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

      <section className="bq-sec bq-sec-first" aria-labelledby="bq-pub-h">
        <h2 id="bq-pub-h">ما يراه الأعضاء</h2>
        {!admin && <p className="bq-lead">يغيّرها المسؤول فقط.</p>}
        <button
          type="button"
          role="switch"
          aria-checked={owed}
          className="bq-switch bq-press"
          disabled={!admin || !online}
          onClick={async () => {
            const next = !owed;
            setOwed(next);
            const r = await updateSettings({ showAmountOwed: next });
            if (!r.ok) {
              setOwed(!next);
              return fail(r.message);
            }
            router.refresh();
          }}
        >
          <span className="bq-switch-t">
            <strong>إظهار المبالغ المتأخرة</strong>
            <span>لم تقرّر اللجنة بعد. عند التشغيل يظهر المبلغ المتأخر في صفحة كل عضو.</span>
          </span>
          <span className="bq-switch-k" aria-hidden="true">
            <span />
          </span>
        </button>

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
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={a.active}
                aria-label={`${METHOD_LABELS[a.method]} ${a.accountNumber}: ${a.active ? "ظاهر للأعضاء" : "مخفي"}`}
                className="bq-mini-switch bq-press"
                disabled={!admin || !online}
                onClick={async () => {
                  const next = !a.active;
                  setOver((o) => ({ ...o, [a.id]: next }));
                  const r = await updateFundAccount({
                    id: a.id,
                    holderName: a.holderName,
                    note: a.note,
                    sortOrder: a.sortOrder,
                    active: next,
                  });
                  if (!r.ok) {
                    setOver((o) => ({ ...o, [a.id]: !next }));
                    return fail(r.message);
                  }
                  router.refresh();
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
              onChange={(e) => setWa(e.target.value.replace(/[^\d+]/g, ""))}
              inputMode="tel"
              dir="ltr"
              aria-label="رقم واتساب اللجنة"
              disabled={!admin}
            />
          </label>
          {admin && (
            <button
              type="button"
              className="bq-btn bq-btn-soft bq-press"
              disabled={!online || wa === (whatsapp ?? "")}
              onClick={async () => {
                const r = await updateSettings({ whatsappContact: wa });
                if (!r.ok) return fail(r.message);
                say("حُفظ رقم واتساب اللجنة");
                router.refresh();
              }}
            >
              حفظ
            </button>
          )}
        </div>
        <OfflineWriteHint />
      </section>

      {admin && (
        <section className="bq-sec" aria-labelledby="bq-inv-h">
          <h2 id="bq-inv-h">إضافة عضو إلى اللجنة</h2>
          <p className="bq-lead">نرسل له رسالة على بريده ليختار كلمة السر.</p>
          <form
            className="bq-login"
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await inviteCommitteeMember({
                email: inv.email,
                displayName: inv.name,
                role: inv.role,
              });
              if (!r.ok) return fail(r.message);
              setInv({ email: "", name: "", role: "committee" });
              say("أُرسلت الدعوة");
            }}
          >
            <label>
              الاسم
              <input
                className="bq-input"
                value={inv.name}
                onChange={(e) => setInv({ ...inv, name: e.target.value })}
                required
              />
            </label>
            <label>
              البريد الإلكتروني
              <input
                className="bq-input"
                type="email"
                dir="ltr"
                value={inv.email}
                onChange={(e) => setInv({ ...inv, email: e.target.value })}
                required
              />
            </label>
            <label>
              الدور
              <select
                className="bq-input"
                value={inv.role}
                onChange={(e) => setInv({ ...inv, role: e.target.value as CommitteeRole })}
              >
                {(["committee", "deputy", "treasurer", "admin"] as const).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="bq-btn bq-btn-primary bq-press" disabled={!online}>
              أرسل الدعوة
            </button>
          </form>
        </section>
      )}

      <section className="bq-sec" aria-labelledby="bq-pw-h">
        <h2 id="bq-pw-h">كلمة السر</h2>
        <form
          className="bq-login"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await setPassword({ password: pw });
            if (!r.ok) return fail(r.message);
            setPw("");
            say("غُيّرت كلمة السر");
          }}
        >
          <label>
            كلمة سر جديدة (8 أحرف على الأقل)
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
            disabled={!online || pw.length < 8}
          >
            احفظ كلمة السر
          </button>
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
