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
import { memberLabel, parseMemberRef, relativeAgo, ROLE_LABEL } from "./derive";
import { I } from "./icons";
import { useNow } from "./num";
import { Sheet } from "./sheet";

type Creds = { name: string; login: string; password: string };
type Result<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

const say = (r: { code: string; message: string }) =>
  r.code === "not_configured"
    ? "إنشاء الحسابات غير مفعّل بعد على الخادم. اطلب من المسؤول إضافة المفتاح السري."
    : r.message;

const ROLES: { k: CommitteeRole; hint: string }[] = [
  { k: "admin", hint: "يدير كل شيء: الإعدادات والحسابات، ويؤكد الدفعات." },
  { k: "treasurer", hint: "يستلم المال ويؤكد الدفعات." },
  { k: "deputy", hint: "يؤكد الدفعات عند غياب أمين الصندوق." },
  { k: "committee", hint: "يسجّل الدفعات فقط، ولا يؤكدها." },
];

/** The four roles as big choices; nothing is chosen until the admin taps one. */
function RolePicker({
  value,
  onChange,
}: {
  value: CommitteeRole | null;
  onChange: (r: CommitteeRole) => void;
}) {
  return (
    <div className="bq-role-list" role="radiogroup" aria-label="الدور">
      {ROLES.map((r) => (
        <button
          key={r.k}
          type="button"
          role="radio"
          aria-checked={value === r.k}
          className="bq-role bq-press"
          onClick={() => onChange(r.k)}
        >
          <span className="bq-role-dot" aria-hidden="true" />
          <span className="bq-role-t">
            <strong>{ROLE_LABEL[r.k]}</strong>
            <span>{r.hint}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

const isPhone = (v: string) => parseLogin(v)?.kind === "phone";

function CredentialsCard({ c, onClose }: { c: Creds; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window === "undefined" ? "/login" : `${window.location.origin}/login`;
  const text = [
    `السلام عليكم ${c.name}،`,
    "هذه بيانات دخولك إلى صندوق الرابطة (اللجنة):",
    // each value alone on its line, with no invisible direction marks: copying it from
    // WhatsApp must give exactly the login and the password
    "الرابط:",
    url,
    "رقم الهاتف أو البريد:",
    c.login,
    "كلمة السر:",
    c.password,
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
  const [role, setRole] = useState<CommitteeRole | null>(null);
  const [memberRef, setMemberRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const loginOk = !!parseLogin(login);
  const typed = memberRef.trim();
  const ref = typed ? (parseMemberRef(typed) ?? typed) : "";
  const member = ref ? members.find((m) => m.memberRef.toUpperCase() === ref) : undefined;
  const ok = name.trim().length > 1 && loginOk && !!role && (!ref || !!member);
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
      <p className="bq-rec-k">الدور (اختر واحدًا)</p>
      <RolePicker value={role} onChange={setRole} />
      <p className="bq-rec-k">رقمه في الصندوق (اختياري)</p>
      <input
        className="bq-input"
        value={memberRef}
        onChange={(e) => setMemberRef(e.target.value)}
        placeholder="مثل أ 12"
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
              role: role!,
              memberId: member?.memberId ?? null,
            });
            setBusy(false);
            if (!r.ok) return setErr(say(r));
            onCreated({ name: name.trim(), login: r.data.login, password: r.data.password });
          }}
        >
          {busy ? "جارٍ الإنشاء…" : role ? "أنشئ الحساب" : "اختر الدور أولًا"}
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
  const [sheet, setSheet] = useState<
    | { t: "add" }
    | { t: "creds"; c: Creds }
    | { t: "role"; a: CommitteeAccount }
    | { t: "delete"; a: CommitteeAccount }
    | null
  >(null);
  const [roleOver, setRoleOver] = useState<Record<string, CommitteeRole>>({});
  const [note, setNote] = useState<Record<string, string>>({});
  const [gone, setGone] = useState<Set<string>>(new Set());
  const list = server
    .filter((a) => !gone.has(a.userId))
    .map((a) => ({
      ...a,
      active: activeOver[a.userId] ?? a.active,
      role: roleOver[a.userId] ?? a.role,
    }));
  const refOf = (id: string | null) => {
    const m = id ? members.find((x) => x.memberId === id) : undefined;
    return m ? memberLabel(m) : undefined;
  };
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
                        · <bdi className="bq-num">{refOf(a.memberId)}</bdi>
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
                      {a.active && (
                        <>
                          <button
                            type="button"
                            className="bq-link bq-link-s bq-press"
                            disabled={!online}
                            onClick={() => setSheet({ t: "role", a })}
                          >
                            تغيير الدور
                          </button>
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
                        </>
                      )}
                      {canDelete(a) && (
                        <button
                          type="button"
                          className="bq-link bq-link-s bq-link-quiet bq-press"
                          disabled={!online}
                          onClick={() => setSheet({ t: "delete", a })}
                        >
                          حذف الحساب
                        </button>
                      )}
                      {(!a.active || !canDelete(a)) && (
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
                          {a.active ? "إيقاف الحساب" : "تفعيل"}
                        </button>
                      )}
                    </span>
                  )}
                  {a.userId !== selfId && a.active && !canDelete(a) && (
                    <span className="bq-row-s">لا يُحذف لأن له عمليات مسجّلة؛ يمكنك إيقافه.</span>
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
      {sheet?.t === "role" && (
        <Sheet key="role" label="تغيير الدور" onDone={() => setSheet(null)}>
          <ChangeRole
            a={sheet.a}
            onSaved={(role) => {
              setRoleOver((o) => ({ ...o, [sheet.a.userId]: role }));
              setNote((n) => ({ ...n, [sheet.a.userId]: `صار دوره: ${ROLE_LABEL[role]}.` }));
              setSheet(null);
              router.refresh();
            }}
          />
        </Sheet>
      )}
      {sheet?.t === "delete" && (
        <Sheet key="delete" label="حذف الحساب" onDone={() => setSheet(null)}>
          <DeleteAccount
            a={sheet.a}
            onBack={() => setSheet(null)}
            onDeleted={() => {
              setGone((g) => new Set(g).add(sheet.a.userId));
              setSheet(null);
              router.refresh();
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

function ChangeRole({ a, onSaved }: { a: CommitteeAccount; onSaved: (r: CommitteeRole) => void }) {
  const online = useOnline();
  const { setCommitteeMember } = useAct();
  const [role, setRole] = useState<CommitteeRole>(a.role);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <div className="bq-rec">
      <h2>تغيير الدور</h2>
      <p className="bq-lead">
        {a.displayName} · الآن {ROLE_LABEL[a.role]}
      </p>
      <RolePicker value={role} onChange={setRole} />
      <div className="bq-rec-foot">
        {err && (
          <p className="bq-alert" role="alert">
            {err}
          </p>
        )}
        <button
          type="button"
          className="bq-btn bq-btn-primary bq-btn-lg bq-press"
          disabled={role === a.role || busy || !online}
          onClick={async () => {
            setBusy(true);
            setErr("");
            const r = await setCommitteeMember({
              userId: a.userId,
              displayName: a.displayName,
              role,
              memberId: a.memberId,
              active: a.active,
            });
            setBusy(false);
            if (!r.ok) return setErr(say(r));
            onSaved(role);
          }}
        >
          {busy ? "جارٍ الحفظ…" : `اجعله ${ROLE_LABEL[role]}`}
        </button>
        <OfflineWriteHint />
      </div>
    </div>
  );
}

/*
 * Deleting an account: Lane A adds deleteCommitteeAccount({ userId }) and
 * CommitteeAccount.canDelete (no recorded operations). Until that lands, both read as absent and
 * the list keeps «إيقاف الحساب».
 */
const canDelete = (a: CommitteeAccount) => !!(a as { canDelete?: boolean }).canDelete;
type DeleteFn = (p: { userId: string }) => Promise<Result<unknown>>;

function DeleteAccount({
  a,
  onBack,
  onDeleted,
}: {
  a: CommitteeAccount;
  onBack: () => void;
  onDeleted: () => void;
}) {
  const online = useOnline();
  const del = (useAct() as unknown as { deleteCommitteeAccount?: DeleteFn }).deleteCommitteeAccount;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <div className="bq-rec bq-cancel">
      <h2>حذف حساب {a.displayName}</h2>
      <p className="bq-lead">سيُحذف الحساب نهائيًا ولن يستطيع الدخول.</p>
      {err && (
        <p className="bq-alert" role="alert">
          {err}
        </p>
      )}
      <div className="bq-rec-foot">
        <button
          type="button"
          className="bq-btn bq-btn-danger bq-btn-lg bq-press"
          disabled={!del || busy || !online}
          onClick={async () => {
            if (!del) return;
            setBusy(true);
            setErr("");
            const r = await del({ userId: a.userId });
            setBusy(false);
            if (!r.ok) return setErr(say(r));
            onDeleted();
          }}
        >
          {busy ? "جارٍ الحذف…" : "احذف الحساب"}
        </button>
        <button type="button" className="bq-btn bq-btn-ghost bq-press" onClick={onBack}>
          رجوع
        </button>
        <OfflineWriteHint />
      </div>
    </div>
  );
}
