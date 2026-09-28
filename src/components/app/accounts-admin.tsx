"use client";
// «حسابات اللجنة» (admin): list accounts, add one, new password, stop/restart. No email invites:
// the admin hands the login details over once (WhatsApp or copy); the password is never shown again.
// TODO(lane-a): createCommitteeAccount / resetCommitteePassword / setCommitteeAccountActive and a
// committee accounts list are coming; until they land, real mode says «قريبًا» and demo simulates.
import { useState } from "react";
import { OfflineWriteHint, useOnline } from "@/components/providers";
import type { CommitteeRole } from "@/lib/data/types";
import { waLink } from "@/lib/whatsapp";
import { useIsDemo } from "./act";
import { relativeAgo, ROLE_LABEL } from "./derive";
import { I } from "./icons";
import { Num, useNow } from "./num";
import { Sheet } from "./sheet";

export type CommitteeAccount = {
  userId: string;
  displayName: string;
  /** phone or email used to sign in */
  login: string;
  role: CommitteeRole;
  active: boolean;
  lastSignInAt: string | null;
  memberRef: string | null;
};

type Creds = { name: string; login: string; password: string };

const ROLES: { k: CommitteeRole; hint: string }[] = [
  { k: "treasurer", hint: "يستلم المال ويؤكد الدفعات." },
  { k: "deputy", hint: "ينوب عن أمين الصندوق ويؤكد الدفعات." },
  { k: "committee", hint: "يسجّل الدفعات والمصاريف، ولا يؤكد." },
  { k: "admin", hint: "يدير الإعدادات والحسابات ويؤكد الدفعات." },
];

const LTR = "⁦"; // keep login and password readable inside an Arabic message
const PDI = "⁩";

/** A readable one-off password: 10 characters without look-alikes (0/O, 1/l). */
function makePassword() {
  const abc = "abcdefghijkmnpqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ23456789";
  const buf = new Uint32Array(10);
  crypto.getRandomValues(buf);
  return [...buf].map((n) => abc[n % abc.length]).join("");
}

const isPhone = (v: string) => /^\+?[\d\s-]{8,15}$/.test(v.trim());

function CredentialsCard({ c, onClose }: { c: Creds; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window === "undefined" ? "/login" : `${window.location.origin}/login`;
  const text = [
    `السلام عليكم ${c.name}،`,
    "هذه بيانات دخولك إلى صندوق البقيع (اللجنة):",
    `الرابط: ${url}`,
    `رقم الهاتف أو البريد: ${LTR}${c.login}${PDI}`,
    `كلمة السر: ${LTR}${c.password}${PDI}`,
    "غيّر كلمة السر بعد أول دخول من «الإعدادات».",
  ].join("\n");
  return (
    <div className="bq-rec bq-creds">
      <h2>بيانات الدخول</h2>
      <p className="bq-lead">أرسلها إلى {c.name} الآن.</p>
      <dl className="bq-facts">
        <div className="is-wide">
          <dt>الرابط</dt>
          <dd>
            <bdi dir="ltr" className="bq-num">
              {url}
            </bdi>
          </dd>
        </div>
        <div className="is-wide">
          <dt>رقم الهاتف أو البريد</dt>
          <dd>
            <bdi dir="ltr" className="bq-num">
              {c.login}
            </bdi>
          </dd>
        </div>
        <div className="is-wide">
          <dt>كلمة السر</dt>
          <dd>
            <bdi dir="ltr" className="bq-num bq-pass">
              {c.password}
            </bdi>
          </dd>
        </div>
      </dl>
      <p className="bq-alert" role="note">
        لن تظهر كلمة السر مرة أخرى. أرسلها أو انسخها قبل الإغلاق.
      </p>
      <div className="bq-btn-col bq-small-top">
        <a
          className="bq-btn bq-btn-primary bq-btn-lg bq-press"
          href={waLink(isPhone(c.login) ? c.login : null, text)}
          target="_blank"
          rel="noopener noreferrer"
        >
          {I.wa(22)} إرسال عبر واتساب
        </a>
        <button
          type="button"
          className="bq-btn bq-btn-soft bq-press"
          onClick={() => {
            navigator.clipboard?.writeText(text).catch(() => {});
            setCopied(true);
          }}
        >
          {copied ? I.check(20) : I.copy(20)} {copied ? "نُسخت" : "نسخ البيانات"}
        </button>
        <button type="button" className="bq-btn bq-btn-ghost bq-press" onClick={onClose}>
          تم
        </button>
      </div>
    </div>
  );
}

function AddAccountForm({ onCreated }: { onCreated: (c: Creds, a: CommitteeAccount) => void }) {
  const online = useOnline();
  const demo = useIsDemo();
  const [name, setName] = useState("");
  const [login, setLogin] = useState("");
  const [role, setRole] = useState<CommitteeRole>("committee");
  const [memberRef, setMemberRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const loginOk = isPhone(login) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login.trim());
  const ok = name.trim().length > 1 && loginOk;
  return (
    <div className="bq-rec">
      <h2>إضافة حساب</h2>
      <p className="bq-rec-k">الاسم</p>
      <input className="bq-input" value={name} onChange={(e) => setName(e.target.value)} aria-label="الاسم" />
      <p className="bq-rec-k">رقم الهاتف أو البريد</p>
      <input
        className="bq-input"
        value={login}
        onChange={(e) => setLogin(e.target.value)}
        dir="ltr"
        inputMode="email"
        autoComplete="off"
        placeholder="مثل 36 12 34 56"
        aria-label="رقم الهاتف أو البريد"
      />
      <p className="bq-rec-k">الدور</p>
      <div className="bq-role-list" role="radiogroup" aria-label="الدور">
        {ROLES.map((r) => (
          <button
            key={r.k}
            type="button"
            role="radio"
            aria-checked={role === r.k}
            className="bq-role bq-press"
            onClick={() => setRole(r.k)}
          >
            <strong>{ROLE_LABEL[r.k]}</strong>
            <span>{r.hint}</span>
          </button>
        ))}
      </div>
      <p className="bq-rec-k">رقمه في الصندوق (اختياري)</p>
      <input
        className="bq-input"
        value={memberRef}
        onChange={(e) => setMemberRef(e.target.value.toUpperCase())}
        dir="ltr"
        placeholder="مثل A-12"
        aria-label="رقم العضو"
      />
      <p className="bq-hint">حتى لا يؤكد دفعاته بنفسه.</p>
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
            setBusy(true);
            setErr("");
            await new Promise((r) => setTimeout(r, 400));
            setBusy(false);
            if (!demo) {
              // TODO(lane-a): createCommitteeAccount({ displayName, login, role, memberRef })
              return setErr("إضافة الحسابات من هنا تصل قريبًا، بعد تحديث الخادم.");
            }
            const password = makePassword();
            onCreated(
              { name: name.trim(), login: login.trim(), password },
              {
                userId: crypto.randomUUID(),
                displayName: name.trim(),
                login: login.trim(),
                role,
                active: true,
                lastSignInAt: null,
                memberRef: memberRef.trim() || null,
              },
            );
          }}
        >
          {busy ? "جارٍ الإنشاء…" : "أنشئ الحساب"}
        </button>
        <OfflineWriteHint />
      </div>
    </div>
  );
}

export function CommitteeAccounts({ accounts: server }: { accounts: CommitteeAccount[] }) {
  const demo = useIsDemo();
  const online = useOnline();
  const now = useNow();
  const [added, setAdded] = useState<CommitteeAccount[]>([]);
  const [activeOver, setActiveOver] = useState<Record<string, boolean>>({});
  const [sheet, setSheet] = useState<{ t: "add" } | { t: "creds"; c: Creds } | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});
  const list = [...server, ...added].map((a) => ({ ...a, active: activeOver[a.userId] ?? a.active }));
  const soon = "تصل قريبًا، بعد تحديث الخادم.";
  return (
    <>
      <button type="button" className="bq-btn bq-btn-soft bq-press" onClick={() => setSheet({ t: "add" })}>
        {I.plus(20)} إضافة حساب
      </button>
      {list.length ? (
        <ul className="bq-list bq-gap-top">
          {list.map((a) => (
            <li key={a.userId}>
              <div className={`bq-row ${a.active ? "" : "is-off"}`}>
                <span className="bq-disc">{I.lock(22)}</span>
                <span className="bq-row-m">
                  <span className="bq-row-t">{a.displayName}</span>
                  <span className="bq-row-s">
                    <bdi dir="ltr" className="bq-num">
                      {a.login}
                    </bdi>{" "}
                    · {ROLE_LABEL[a.role]}
                    {a.memberRef ? (
                      <>
                        {" "}
                        · <Num>{a.memberRef}</Num>
                      </>
                    ) : null}
                  </span>
                  <span className="bq-row-s">
                    {!a.active
                      ? "موقوف"
                      : a.lastSignInAt
                        ? `آخر دخول ${now ? relativeAgo(a.lastSignInAt, now) : ""}`
                        : "لم يدخل بعد"}
                  </span>
                  {note[a.userId] && <span className="bq-row-s">{note[a.userId]}</span>}
                  <span className="bq-com-actions">
                    <button
                      type="button"
                      className="bq-link bq-link-s bq-press"
                      disabled={!online}
                      onClick={() =>
                        demo
                          ? setSheet({ t: "creds", c: { name: a.displayName, login: a.login, password: makePassword() } })
                          : setNote((n) => ({ ...n, [a.userId]: `كلمة سر جديدة: ${soon}` }))
                      }
                    >
                      كلمة سر جديدة
                    </button>
                    <button
                      type="button"
                      className="bq-link bq-link-s bq-link-quiet bq-press"
                      disabled={!online}
                      onClick={() =>
                        demo
                          ? setActiveOver((o) => ({ ...o, [a.userId]: !a.active }))
                          : setNote((n) => ({ ...n, [a.userId]: `الإيقاف: ${soon}` }))
                      }
                    >
                      {a.active ? "إيقاف الحساب" : "تفعيل الحساب"}
                    </button>
                  </span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="bq-hint bq-gap-top">لا توجد حسابات أخرى بعد.</p>
      )}
      {sheet?.t === "add" && (
        <Sheet key="add" label="إضافة حساب" onDone={() => setSheet(null)}>
          <AddAccountForm
            onCreated={(c, a) => {
              setAdded((l) => [...l, a]);
              setSheet({ t: "creds", c });
            }}
          />
        </Sheet>
      )}
      {sheet?.t === "creds" && (
        <Sheet key="creds" label="بيانات الدخول" onDone={() => setSheet(null)}>
          <CredentialsCard c={sheet.c} onClose={() => setSheet(null)} />
        </Sheet>
      )}
    </>
  );
}
