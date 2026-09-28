"use client";
// «حسابات اللجنة» (admin): list accounts, add one, new password, stop/restart. No email invites:
// the admin hands the login details over once (WhatsApp or copy); the password is never shown again.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { OfflineWriteHint, useOnline } from "@/components/providers";
import type { CommitteeAccount, CommitteeRole, IssuedCredentials } from "@/lib/data/types";
import { parseLogin } from "@/lib/data/logins";
import { waLink } from "@/lib/whatsapp";
import { useAct } from "./act";
import { relativeAgo, ROLE_LABEL } from "./derive";
import { I } from "./icons";
import { Num, useNow } from "./num";
import { Sheet } from "./sheet";

type Creds = { name: string; login: string; password: string };
type Result<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

const say = (r: { code: string; message: string }) =>
  r.code === "not_configured"
    ? "إنشاء الحسابات غير مفعّل بعد على الخادم — اطلب من المسؤول إضافة المفتاح السري."
    : r.message;

const ROLES: { k: CommitteeRole; hint: string }[] = [
  { k: "treasurer", hint: "يستلم المال ويؤكد الدفعات." },
  { k: "deputy", hint: "ينوب عن أمين الصندوق ويؤكد الدفعات." },
  { k: "committee", hint: "يسجّل الدفعات والمصاريف، ولا يؤكد." },
  { k: "admin", hint: "يدير الإعدادات والحسابات ويؤكد الدفعات." },
];

const LTR = "⁦"; // keep login and password readable inside an Arabic message
const PDI = "⁩";

const isPhone = (v: string) => parseLogin(v)?.kind === "phone";

function CredentialsCard({ c, onClose }: { c: Creds; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window === "undefined" ? "/login" : `${window.location.origin}/login`;
  const text = [
    `السلام عليكم ${c.name}،`,
    "هذه بيانات دخولك إلى صندوق الشباب (اللجنة):",
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

function AddAccountForm({
  members,
  onCreated,
}: {
  members: { memberId: string; memberRef: string }[];
  onCreated: (c: Creds) => void;
}) {
  const online = useOnline();
  const { createCommitteeAccount } = useAct();
  const [name, setName] = useState("");
  const [login, setLogin] = useState("");
  const [role, setRole] = useState<CommitteeRole>("committee");
  const [memberRef, setMemberRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const loginOk = !!parseLogin(login);
  const ref = memberRef.trim().replace(/\s+/g, "");
  const member = ref ? members.find((m) => m.memberRef.toUpperCase() === ref) : undefined;
  const ok = name.trim().length > 1 && loginOk && (!ref || !!member);
  return (
    <div className="bq-rec">
      <h2>إضافة حساب</h2>
      <p className="bq-rec-k">الاسم</p>
      <input
        className="bq-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="الاسم"
      />
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
      <p className="bq-hint">
        {ref && !member ? "لا يوجد عضو بهذا الرقم." : "حتى لا يؤكد دفعاته بنفسه."}
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
            setBusy(true);
            setErr("");
            const r: Result<IssuedCredentials> = await createCommitteeAccount({
              displayName: name.trim(),
              login: login.trim(),
              role,
              memberId: member?.memberId ?? null,
            });
            setBusy(false);
            if (!r.ok) return setErr(say(r));
            onCreated({ name: name.trim(), login: r.data.login, password: r.data.password });
          }}
        >
          {busy ? "جارٍ الإنشاء…" : "أنشئ الحساب"}
        </button>
        <OfflineWriteHint />
      </div>
    </div>
  );
}

export function CommitteeAccounts({
  accounts: server,
  members,
  selfId,
}: {
  accounts: CommitteeAccount[];
  members: { memberId: string; memberRef: string }[];
  /** the signed-in admin: no password reset or stop on oneself */
  selfId: string | null;
}) {
  const online = useOnline();
  const now = useNow();
  const router = useRouter();
  const { resetCommitteePassword, setCommitteeActive } = useAct();
  const [activeOver, setActiveOver] = useState<Record<string, boolean>>({});
  const [sheet, setSheet] = useState<{ t: "add" } | { t: "creds"; c: Creds } | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});
  const list = server.map((a) => ({ ...a, active: activeOver[a.userId] ?? a.active }));
  const refOf = (id: string | null) =>
    id ? members.find((m) => m.memberId === id)?.memberRef : undefined;
  return (
    <>
      <button
        type="button"
        className="bq-btn bq-btn-soft bq-press"
        onClick={() => setSheet({ t: "add" })}
      >
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
                    {refOf(a.memberId) ? (
                      <>
                        {" "}
                        · <Num>{refOf(a.memberId)}</Num>
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
                  {a.userId !== selfId && (
                    <span className="bq-com-actions">
                      <button
                        type="button"
                        className="bq-link bq-link-s bq-press"
                        disabled={!online}
                        onClick={async () => {
                          const r: Result<IssuedCredentials> = await resetCommitteePassword({
                            userId: a.userId,
                          });
                          if (!r.ok) return setNote((n) => ({ ...n, [a.userId]: say(r) }));
                          setSheet({
                            t: "creds",
                            c: {
                              name: a.displayName,
                              login: r.data.login,
                              password: r.data.password,
                            },
                          });
                        }}
                      >
                        كلمة سر جديدة
                      </button>
                      <button
                        type="button"
                        className="bq-link bq-link-s bq-link-quiet bq-press"
                        disabled={!online}
                        onClick={async () => {
                          const next = !a.active;
                          setActiveOver((o) => ({ ...o, [a.userId]: next }));
                          const r = await setCommitteeActive({ userId: a.userId, active: next });
                          if (!r.ok) {
                            setActiveOver((o) => ({ ...o, [a.userId]: !next }));
                            return setNote((n) => ({ ...n, [a.userId]: say(r) }));
                          }
                          setNote((n) => ({
                            ...n,
                            [a.userId]: next ? "فُعّل الحساب." : "أُوقف الحساب.",
                          }));
                          router.refresh();
                        }}
                      >
                        {a.active ? "إيقاف الحساب" : "تفعيل الحساب"}
                      </button>
                    </span>
                  )}
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
            members={members}
            onCreated={(c) => {
              router.refresh();
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
