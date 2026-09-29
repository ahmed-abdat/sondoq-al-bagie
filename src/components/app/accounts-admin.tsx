"use client";
// «حسابات اللجنة» (admin): one row per account; tapping it opens everything about it (new password,
// role, membership, stop/restart, delete). No email: the admin hands the login details over once
// (WhatsApp or copy); the password is never shown again.
import { failure } from "@/lib/data/errors";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { OfflineWriteHint, useOnline } from "@/components/providers";
import type { CommitteeAccount, CommitteeRole, IssuedCredentials } from "@/lib/data/types";
import { parseLogin } from "@/lib/data/logins";
import { waLink } from "@/lib/whatsapp";
import { useAct } from "./act";
import { MemberNo } from "./bits";
import { memberLabel, relativeAgo, ROLE_LABEL } from "./derive";
import { I } from "./icons";
import { MemberPick, PickedMember, type Pickable } from "./member-pick";
import { useNow } from "./num";
import { Sheet } from "./sheet";
import { useSnack } from "./shell";
import { radioKeys, radioTab } from "./radio-keys";

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
    <div className="bq-role-list" role="radiogroup" onKeyDown={radioKeys} aria-label="الدور">
      {ROLES.map((r, i, all) => (
        <button
          key={r.k}
          type="button"
          role="radio"
          aria-checked={value === r.k}
          tabIndex={radioTab(
            value === r.k,
            i,
            all.some((y) => y.k === value),
          )}
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

type Linkable = Pickable & { status: string };

function AddAccountForm({
  members,
  accounts,
  onCreated,
}: {
  /** active members not linked to an account yet */
  members: Linkable[];
  /** existing accounts: a login already taken (an earlier try whose answer was lost) is found here */
  accounts: CommitteeAccount[];
  onCreated: (c: Creds) => void;
}) {
  const router = useRouter();
  const online = useOnline();
  const { createCommitteeAccount, resetCommitteePassword } = useAct();
  const [taken, setTaken] = useState(false);
  const [name, setName] = useState("");
  const [login, setLogin] = useState("");
  const [role, setRole] = useState<CommitteeRole | null>(null);
  const [member, setMember] = useState<Linkable | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const loginOk = !!parseLogin(login);
  const sameLogin = (a: string) => parseLogin(a)?.display === parseLogin(login)?.display;
  const existing = taken ? accounts.find((a) => sameLogin(a.login)) : undefined;
  const ok = name.trim().length > 1 && loginOk && !!role;
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
        onChange={(e) => {
          setLogin(e.target.value);
          setTaken(false);
        }}
        dir="ltr"
        inputMode="email"
        autoComplete="off"
        placeholder="مثل 36 12 34 56"
        aria-label="رقم الهاتف أو البريد"
      />
      <p className="bq-rec-k">الدور</p>
      <RolePicker value={role} onChange={setRole} />
      <p className="bq-rec-k">عضويته في الصندوق (اختياري)</p>
      {member ? (
        <PickedMember
          m={member}
          onChange={() => setPicking(true)}
          onClear={() => setMember(null)}
        />
      ) : (
        <button
          type="button"
          className="bq-btn bq-btn-tonal bq-press"
          onClick={() => setPicking(true)}
        >
          {I.people(20)} اختر العضو
        </button>
      )}
      <p className="bq-hint">حتى لا يؤكد دفعاته بنفسه.</p>
      <div className="bq-rec-foot">
        {taken && (
          <div className="bq-wait" role="status">
            <p>الحساب موجود. أعد تعيين كلمة السر لتحصل على كلمة جديدة.</p>
            {existing ? (
              <button
                type="button"
                className="bq-btn bq-btn-tonal bq-press"
                disabled={busy || !online}
                onClick={async () => {
                  setBusy(true);
                  setErr("");
                  const r = await resetCommitteePassword({ userId: existing.userId });
                  setBusy(false);
                  if (!r.ok) return setErr(say(r));
                  onCreated({
                    name: existing.displayName,
                    login: r.data.login,
                    password: r.data.password,
                  });
                }}
              >
                كلمة سر جديدة لحساب {existing.displayName}
              </button>
            ) : (
              <p className="bq-hint">تجده في قائمة الحسابات بعد لحظة، ومنه «كلمة سر جديدة».</p>
            )}
          </div>
        )}
        {err && (
          <p className="bq-alert" role="alert">
            {err}
          </p>
        )}
        <button
          type="button"
          className="bq-btn bq-btn-primary bq-btn-lg bq-press"
          disabled={!ok || busy || !online || taken}
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
            if (!r.ok && r.code === "login_taken") {
              setTaken(true);
              router.refresh(); // the list may not have it yet
              return;
            }
            if (!r.ok) return setErr(say(r));
            onCreated({ name: name.trim(), login: r.data.login, password: r.data.password });
          }}
        >
          {busy ? "جارٍ الإنشاء…" : role ? "أنشئ الحساب" : "اختر الدور أولًا"}
        </button>
        <OfflineWriteHint />
      </div>
      {picking && (
        <Sheet label="اختر العضو" onDone={() => setPicking(false)}>
          <MemberPick
            members={members}
            title="من هو في قائمة الأعضاء؟"
            onPick={(m) => {
              setMember(m);
              setPicking(false);
            }}
          />
        </Sheet>
      )}
    </div>
  );
}

type Mode = "view" | "role" | "member" | "unlink" | "stop" | "delete";

/** One account: facts, then its actions. Confirmations replace the content in the same sheet. */
function AccountSheet({
  a,
  self,
  member,
  free,
  onPatch,
  onCreds,
  onGone,
}: {
  a: CommitteeAccount;
  self: boolean;
  member: Linkable | undefined;
  /** members that can be linked to this account */
  free: Linkable[];
  onPatch: (p: Partial<CommitteeAccount>, note: string) => void;
  onCreds: (c: Creds) => void;
  onGone: () => void;
}) {
  const online = useOnline();
  const now = useNow();
  const { resetCommitteePassword, setCommitteeActive, linkCommitteeMember, setCommitteeNotMember } =
    useAct();
  const [mode, setMode] = useState<Mode>("view");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const act = async (f: () => Promise<{ ok: boolean; code?: string; message?: string }>) => {
    setBusy(true);
    setErr("");
    const r = await f()
      .catch(() => failure("network"))
      .finally(() => setBusy(false));
    if (!r.ok) setErr(say({ code: r.code ?? "", message: r.message ?? "" }));
    return r.ok;
  };
  const back = () => {
    setMode("view");
    setErr("");
  };

  if (mode === "role")
    return (
      <ChangeRole
        a={a}
        onBack={back}
        onSaved={(role) => onPatch({ role }, `صار دور ${a.displayName}: ${ROLE_LABEL[role]}`)}
      />
    );
  if (mode === "member")
    return (
      <MemberPick
        members={free}
        title={`عضوية ${a.displayName}`}
        onPick={async (m) => {
          const ok = await act(() =>
            linkCommitteeMember({ userId: a.userId, memberId: m.memberId }),
          );
          if (ok)
            onPatch(
              { memberId: m.memberId, needsMemberLink: false, notMember: false },
              `رُبط ${a.displayName} بعضوية ${m.fullName}`,
            );
          else back();
        }}
      />
    );
  if (mode === "unlink" && member)
    return (
      <Confirm
        title="إزالة الربط"
        lead={`لن يبقى حساب ${a.displayName} مربوطًا بعضوية ${member.fullName}. تبقى العضوية ودفعاتها كما هي.`}
        verb={busy ? "جارٍ الحفظ…" : "أزل الربط"}
        tone="tonal"
        busy={busy}
        err={err}
        onBack={back}
        onYes={async () => {
          if (await act(() => linkCommitteeMember({ userId: a.userId, memberId: null })))
            onPatch(
              { memberId: null, needsMemberLink: a.role !== "committee" && !a.notMember },
              `أُزيل ربط ${a.displayName} بالعضوية`,
            );
        }}
      />
    );
  if (mode === "stop")
    return (
      <Confirm
        title={`إيقاف حساب ${a.displayName}`}
        lead="لن يستطيع الدخول إلى صفحة اللجنة حتى تعيد تفعيله. تبقى عملياته كما هي."
        verb={busy ? "جارٍ الإيقاف…" : "أوقف الحساب"}
        busy={busy}
        err={err}
        onBack={back}
        onYes={async () => {
          if (await act(() => setCommitteeActive({ userId: a.userId, active: false })))
            onPatch({ active: false }, `أُوقف حساب ${a.displayName}`);
        }}
      />
    );
  if (mode === "delete")
    return (
      <DeleteAccount
        a={a}
        onBack={back}
        onDeleted={() => {
          onGone();
        }}
      />
    );

  return (
    <div className="bq-rec">
      <div className="bq-mhead">
        <span className="bq-disc">{I.lock(22)}</span>
        <div>
          <h2>{a.displayName}</h2>
          <p className="bq-hint">
            {ROLE_LABEL[a.role]}
            {!a.active && " · موقوف"}
          </p>
        </div>
      </div>
      <dl className="bq-facts">
        <div className="is-wide">
          <dt>البريد أو الهاتف للدخول</dt>
          <dd>
            <bdi dir="ltr" className="bq-num">
              {a.login}
            </bdi>
          </dd>
        </div>
        <div>
          <dt>آخر دخول</dt>
          <dd>{a.lastSignInAt ? (now ? relativeAgo(a.lastSignInAt, now) : "") : "لم يدخل بعد"}</dd>
        </div>
        <div>
          <dt>العضوية</dt>
          <dd>
            {member
              ? `${member.fullName} (${memberLabel(member)})`
              : a.notMember
                ? "ليس عضوًا في الصندوق"
                : "غير مربوط"}
          </dd>
        </div>
      </dl>
      {err && (
        <p className="bq-alert" role="alert">
          {err}
        </p>
      )}
      {!self && a.active && a.needsMemberLink && (
        <div className="bq-wait" role="status">
          <p>هذا الحساب يؤكد الدفعات وليس مربوطًا بعضو، فقد يؤكد دفعاته بنفسه.</p>
          <p className="bq-hint">اربطه بعضويته، أو قل إنه ليس عضوًا في الصندوق.</p>
          <button
            type="button"
            className="bq-link bq-link-s bq-press"
            disabled={!online || busy}
            onClick={async () => {
              if (await act(() => setCommitteeNotMember({ userId: a.userId, notMember: true })))
                onPatch(
                  { notMember: true, needsMemberLink: false },
                  `${a.displayName}: ليس عضوًا في الصندوق`,
                );
            }}
          >
            ليس عضوًا
          </button>
        </div>
      )}
      {!self && !member && a.notMember && (
        <button
          type="button"
          className="bq-link bq-link-quiet bq-press"
          disabled={!online || busy}
          onClick={async () => {
            if (await act(() => setCommitteeNotMember({ userId: a.userId, notMember: false })))
              onPatch(
                { notMember: false, needsMemberLink: a.role !== "committee" },
                `أُلغي «ليس عضوًا» لـ ${a.displayName}`,
              );
          }}
        >
          إلغاء «ليس عضوًا»
        </button>
      )}
      {self ? (
        <>
          <p className="bq-hint bq-small-top">هذا حسابك. اسمك وكلمة السر في «حسابي».</p>
          <div className="bq-btn-col">
            <Link className="bq-btn bq-btn-soft bq-press" href="/committee/account">
              {I.people(20)} حسابي
            </Link>
          </div>
        </>
      ) : a.active ? (
        <div className="bq-btn-col">
          <button
            type="button"
            className="bq-btn bq-btn-soft bq-press"
            disabled={!online || busy}
            onClick={async () => {
              setBusy(true);
              setErr("");
              const r: Result<IssuedCredentials> = await resetCommitteePassword({
                userId: a.userId,
              });
              setBusy(false);
              if (!r.ok) return setErr(say(r));
              onCreds({ name: a.displayName, login: r.data.login, password: r.data.password });
            }}
          >
            {I.lock(20)} كلمة سر جديدة
          </button>
          <button
            type="button"
            className="bq-btn bq-btn-soft bq-press"
            disabled={!online}
            onClick={() => setMode("role")}
          >
            تغيير الدور
          </button>
          <button
            type="button"
            className="bq-btn bq-btn-soft bq-press"
            disabled={!online}
            onClick={() => setMode("member")}
          >
            {member ? "تغيير العضوية" : "ربطه بعضوية"}
          </button>
          {member && (
            <button
              type="button"
              className="bq-btn bq-btn-ghost bq-press"
              disabled={!online}
              onClick={() => setMode("unlink")}
            >
              إزالة الربط
            </button>
          )}
          <button
            type="button"
            className="bq-btn bq-btn-tonal bq-press"
            disabled={!online}
            onClick={() => setMode("stop")}
          >
            إيقاف الحساب
          </button>
        </div>
      ) : (
        <div className="bq-btn-col">
          <button
            type="button"
            className="bq-btn bq-btn-primary bq-btn-lg bq-press"
            disabled={!online || busy}
            onClick={async () => {
              if (await act(() => setCommitteeActive({ userId: a.userId, active: true })))
                onPatch(
                  { active: true },
                  `فُعّل الحساب. اطلب من ${a.displayName} تسجيل الدخول من جديد.`,
                );
            }}
          >
            {busy ? "جارٍ التفعيل…" : "أعد تفعيل الحساب"}
          </button>
        </div>
      )}
      {!self &&
        (a.canDelete ? (
          <button
            type="button"
            className="bq-link bq-link-quiet bq-press bq-small-top"
            disabled={!online}
            onClick={() => setMode("delete")}
          >
            حذف الحساب نهائيًا
          </button>
        ) : (
          <p className="bq-hint bq-small-top">لا يُحذف لأن له عمليات مسجّلة. يمكنك إيقافه.</p>
        ))}
      <OfflineWriteHint />
    </div>
  );
}

export function CommitteeAccounts({
  accounts: server,
  members,
  selfId,
}: {
  accounts: CommitteeAccount[];
  members: Linkable[];
  /** the signed-in admin: no password reset or stop on oneself */
  selfId: string | null;
}) {
  const now = useNow();
  const router = useRouter();
  const toast = useSnack();
  const [sheet, setSheet] = useState<
    { t: "add" } | { t: "creds"; c: Creds } | { t: "acct"; id: string } | null
  >(null);
  const [patch, setPatch] = useState<Record<string, Partial<CommitteeAccount>>>({});
  const [gone, setGone] = useState<Set<string>>(new Set());
  const list = server.filter((a) => !gone.has(a.userId)).map((a) => ({ ...a, ...patch[a.userId] }));
  const byId = new Map(members.map((m) => [m.memberId, m]));
  const linked = new Set(list.map((a) => a.memberId).filter(Boolean));
  const free = members.filter((m) => m.status === "active" && !linked.has(m.memberId));
  const open = sheet?.t === "acct" ? list.find((a) => a.userId === sheet.id) : undefined;
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
          {list.map((a) => {
            const m = a.memberId ? byId.get(a.memberId) : undefined;
            return (
              <li key={a.userId}>
                <button
                  type="button"
                  className={`bq-row bq-press ${a.active ? "" : "is-off"}`}
                  onClick={() => setSheet({ t: "acct", id: a.userId })}
                >
                  <span className="bq-disc">{I.lock(22)}</span>
                  <span className="bq-row-m">
                    <span className="bq-row-t">
                      {a.displayName}
                      {a.userId === selfId && <span className="bq-row-s"> (أنت)</span>}
                    </span>
                    <span className="bq-row-s">
                      {ROLE_LABEL[a.role]}
                      {m && (
                        <>
                          {" "}
                          · <MemberNo m={m} />
                        </>
                      )}
                      {" · "}
                      {a.active && a.needsMemberLink && "غير مربوط بعضو · "}
                      {!a.active
                        ? "موقوف"
                        : a.lastSignInAt
                          ? `دخل ${now ? relativeAgo(a.lastSignInAt, now) : ""}`
                          : "لم يدخل بعد"}
                    </span>
                  </span>
                  <span className="bq-chev">{I.go(18)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="bq-hint bq-gap-top">لا توجد حسابات أخرى بعد.</p>
      )}
      {sheet?.t === "add" && (
        <Sheet key="add" label="إضافة حساب" onDone={() => setSheet(null)}>
          <AddAccountForm
            members={free}
            accounts={list}
            onCreated={(c) => {
              router.refresh();
              setSheet({ t: "creds", c });
            }}
          />
        </Sheet>
      )}
      {open && (
        <Sheet key={`acct-${open.userId}`} label={open.displayName} onDone={() => setSheet(null)}>
          <AccountSheet
            a={open}
            self={open.userId === selfId}
            member={open.memberId ? byId.get(open.memberId) : undefined}
            free={free}
            onPatch={(p, note) => {
              setPatch((o) => ({ ...o, [open.userId]: { ...o[open.userId], ...p } }));
              setSheet(null);
              toast(note);
              router.refresh();
            }}
            onCreds={(c) => setSheet({ t: "creds", c })}
            onGone={() => {
              setGone((g) => new Set(g).add(open.userId));
              setSheet(null);
              toast(`حُذف حساب ${open.displayName}`);
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

function Confirm({
  title,
  lead,
  verb,
  tone = "danger",
  busy,
  err,
  onBack,
  onYes,
}: {
  title: string;
  lead: string;
  verb: string;
  tone?: "danger" | "tonal";
  busy: boolean;
  err: string;
  onBack: () => void;
  onYes: () => void;
}) {
  const online = useOnline();
  return (
    <div className="bq-rec bq-cancel">
      <h2>{title}</h2>
      <p className="bq-lead">{lead}</p>
      {err && (
        <p className="bq-alert" role="alert">
          {err}
        </p>
      )}
      <div className="bq-rec-foot">
        <button
          type="button"
          className={`bq-btn bq-btn-${tone} bq-btn-lg bq-press`}
          disabled={busy || !online}
          onClick={onYes}
        >
          {verb}
        </button>
        <button type="button" className="bq-btn bq-btn-ghost bq-press" onClick={onBack}>
          رجوع
        </button>
        <OfflineWriteHint />
      </div>
    </div>
  );
}

function ChangeRole({
  a,
  onBack,
  onSaved,
}: {
  a: CommitteeAccount;
  onBack: () => void;
  onSaved: (r: CommitteeRole) => void;
}) {
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
        <button type="button" className="bq-btn bq-btn-ghost bq-press" onClick={onBack}>
          رجوع
        </button>
        <OfflineWriteHint />
      </div>
    </div>
  );
}

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
  const { deleteCommitteeAccount } = useAct();
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
          disabled={busy || !online}
          onClick={async () => {
            setBusy(true);
            setErr("");
            const r = await deleteCommitteeAccount({ userId: a.userId });
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
