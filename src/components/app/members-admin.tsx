"use client";
// Committee «الأعضاء»: find a member, add one, edit details, change state, move between lists.
// Two lists, each numbered from 1 (A-12, B-12). States: نشط · معفى · غادر · متوفى.
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { OfflineWriteHint, useOnline } from "@/components/providers";
import { MEMBER_STATUSES, type MemberAdmin, type SettableStatus } from "@/lib/data/types";
import { useAct, useDemoState } from "./act";
import { Avatar, StatusTag } from "./bits";
import {
  fmt,
  groupLabel,
  memberCode,
  MONTHS,
  nextFreeNumber,
  searchMembers,
  STATE_LABEL,
} from "./derive";
import { I } from "./icons";
import { Num } from "./num";
import { Segmented } from "./segmented";
import { Sheet } from "./sheet";
import { useSnack } from "./shell";

type State = SettableStatus;
const STATES = MEMBER_STATUSES;
const LISTS = ["A", "B"] as const;

/** "YYYY-MM" (month input) → "YYYY-MM-01" (action input). */
const firstOf = (ym: string) => `${ym}-01`;
const ymLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};

function MonthField({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <input
      className="bq-input"
      type="month"
      dir="ltr"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
    />
  );
}

function Err({ text }: { text: string }) {
  return text ? (
    <p className="bq-alert" role="alert">
      {text}
    </p>
  ) : null;
}

export function AddMemberBody({
  members,
  prices,
  thisMonth,
  onDone,
}: {
  members: MemberAdmin[];
  prices: Record<string, number>;
  /** "YYYY-MM" */
  thisMonth: string;
  onDone: (t: string) => void;
}) {
  const router = useRouter();
  const online = useOnline();
  const { addMember, nextMemberNumber } = useAct();
  const [list, setList] = useState<"A" | "B">("B");
  const [num, setNum] = useState(String(nextFreeNumber(members, "B")));
  // the server knows the real next number (the local list may be filtered or stale)
  const pickList = (l: "A" | "B") => {
    setList(l);
    setNum(String(nextFreeNumber(members, l)));
    void nextMemberNumber({ listCode: l }).then((r) => {
      if (r.ok && r.data > 0) setNum(String(r.data));
    });
  };
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [from, setFrom] = useState(thisMonth);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const n = Number(num);
  const taken = members.some((m) => m.listCode === list && m.number === n);
  const ok = n > 0 && !taken && name.trim().length > 2 && /^\d{4}-\d{2}$/.test(from);
  return (
    <div className="bq-rec">
      <h2>إضافة عضو</h2>
      <p className="bq-rec-k">القائمة</p>
      <div className="bq-chips" role="radiogroup" aria-label="القائمة">
        {LISTS.map((g) => (
          <button
            key={g}
            type="button"
            role="radio"
            aria-checked={list === g}
            className="bq-chip bq-press"
            onClick={() => pickList(g)}
          >
            قائمة {g} · الفئة {groupLabel(g)}
            {prices[g] ? (
              <>
                {" "}
                · <Num>{fmt(prices[g])}</Num>
              </>
            ) : null}
          </button>
        ))}
      </div>
      <p className="bq-rec-k">الرقم في القائمة</p>
      <div className="bq-field" dir="ltr">
        <Num className="bq-strong">{list}-</Num>
        <input
          className="bq-input"
          value={num}
          onChange={(e) => setNum(e.target.value.replace(/[^\d]/g, ""))}
          inputMode="numeric"
          dir="ltr"
          aria-label="رقم العضو"
        />
      </div>
      <p className="bq-hint">
        {taken ? "هذا الرقم مأخوذ في هذه القائمة." : "أول رقم فارغ في القائمة."}
      </p>
      <p className="bq-rec-k">الاسم الكامل</p>
      <input
        className="bq-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="الاسم الكامل"
      />
      <p className="bq-rec-k">رقم الهاتف (اختياري)</p>
      <input
        className="bq-input"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        inputMode="tel"
        dir="ltr"
        aria-label="رقم الهاتف"
      />
      <p className="bq-hint">للتذكير عبر واتساب فقط. لا يظهر للأعضاء.</p>
      <p className="bq-rec-k">تُحسب عليه الرسوم من شهر</p>
      <MonthField value={from} onChange={setFrom} label="أول شهر" />
      <div className="bq-rec-foot">
        <Err text={err} />
        <button
          type="button"
          className="bq-btn bq-btn-primary bq-btn-lg bq-press"
          disabled={!ok || busy || !online}
          onClick={async () => {
            setBusy(true);
            setErr("");
            const r = await addMember({
              listCode: list,
              number: n,
              fullName: name.trim(),
              groupCode: list,
              fromMonth: firstOf(from),
              phone: phone.trim() || undefined,
            });
            setBusy(false);
            if (!r.ok) return setErr(r.message);
            router.refresh();
            onDone(`أُضيف ${name.trim()} برقم ${list}-${n}`);
          }}
        >
          {busy ? "جارٍ الحفظ…" : "أضف العضو"}
        </button>
        <OfflineWriteHint />
      </div>
    </div>
  );
}

export function MemberAdminBody({
  m,
  thisMonth,
  onDone,
}: {
  m: MemberAdmin;
  thisMonth: string;
  onDone: (t: string) => void;
}) {
  const router = useRouter();
  const online = useOnline();
  const { updateMember, changeMemberStatus, changeMemberGroup } = useAct();
  const [mode, setMode] = useState<"view" | "edit" | "state" | "move">("view");
  const [name, setName] = useState(m.fullName);
  const [phone, setPhone] = useState(m.phone ?? "");
  const [note, setNote] = useState(m.note ?? "");
  const [state, setState] = useState<State | null>(null);
  const [from, setFrom] = useState(thisMonth);
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const other = m.groupCode === "A" ? "B" : "A";
  const go = (next: typeof mode) => {
    setMode(next);
    setReason("");
    setState(null);
    setConfirming(false);
    setErr("");
  };

  const run = async (f: () => Promise<{ ok: boolean; message?: string }>, done: string) => {
    setBusy(true);
    setErr("");
    const r = await f();
    setBusy(false);
    if (!r.ok) return setErr(r.message ?? "");
    router.refresh();
    onDone(done);
  };

  return (
    <div className="bq-rec">
      <div className="bq-mhead">
        <Avatar code={memberCode(m)} size={56} />
        <div>
          <h2>{m.fullName}</h2>
          <p className="bq-hint">
            <Num>{memberCode(m)}</Num> · الفئة {groupLabel(m.groupCode)} ·{" "}
            {STATE_LABEL[m.status as State] ?? m.status}
          </p>
          {m.phone && (
            <p className="bq-hint">
              <bdi dir="ltr" className="bq-num">
                {m.phone}
              </bdi>
            </p>
          )}
        </div>
      </div>

      {mode === "view" && (
        <div className="bq-btn-col bq-small-top">
          <button type="button" className="bq-btn bq-btn-soft bq-press" onClick={() => go("edit")}>
            تعديل البيانات
          </button>
          <button type="button" className="bq-btn bq-btn-soft bq-press" onClick={() => go("state")}>
            تغيير الحالة
          </button>
          <button type="button" className="bq-btn bq-btn-soft bq-press" onClick={() => go("move")}>
            نقل إلى الفئة {groupLabel(other)}
          </button>
        </div>
      )}

      {mode === "edit" && (
        <>
          <p className="bq-rec-k">الاسم الكامل</p>
          <input
            className="bq-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="الاسم الكامل"
          />
          <p className="bq-rec-k">رقم الهاتف (اختياري)</p>
          <input
            className="bq-input"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            dir="ltr"
            aria-label="رقم الهاتف"
          />
          <p className="bq-rec-k">ملاحظة (للجنة فقط)</p>
          <input
            className="bq-input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-label="ملاحظة"
          />
          <div className="bq-rec-foot">
            <Err text={err} />
            <div className="bq-slip-btns">
              <button
                type="button"
                className="bq-btn bq-btn-primary bq-press"
                disabled={name.trim().length < 3 || busy || !online}
                onClick={() =>
                  run(
                    () =>
                      updateMember({
                        memberId: m.memberId,
                        fullName: name.trim(),
                        phone: phone.trim() || null,
                        note: note.trim() || null,
                      }),
                    "حُفظت البيانات",
                  )
                }
              >
                احفظ
              </button>
              <button
                type="button"
                className="bq-btn bq-btn-ghost bq-press"
                onClick={() => go("view")}
              >
                رجوع
              </button>
            </div>
            <OfflineWriteHint />
          </div>
        </>
      )}

      {mode === "state" && !confirming && (
        <>
          <p className="bq-rec-k">الحالة الجديدة</p>
          <div className="bq-chips" role="radiogroup" aria-label="الحالة">
            {STATES.filter((s) => s !== m.status).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={state === s}
                className="bq-chip bq-press"
                onClick={() => setState(s)}
              >
                {STATE_LABEL[s]}
              </button>
            ))}
          </div>
          <p className="bq-rec-k">ابتداءً من شهر</p>
          <MonthField value={from} onChange={setFrom} label="من شهر" />
          <p className="bq-rec-k">السبب</p>
          <input
            className="bq-input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="مثل: سافر للدراسة، طلب الإعفاء"
            aria-label="سبب تغيير الحالة"
          />
          <div className="bq-rec-foot">
            <Err text={err} />
            <div className="bq-slip-btns">
              <button
                type="button"
                className="bq-btn bq-btn-primary bq-press"
                disabled={!state || !reason.trim() || busy || !online}
                onClick={() => {
                  if (state === "left" || state === "deceased") return setConfirming(true);
                  void run(
                    () =>
                      changeMemberStatus({
                        memberId: m.memberId,
                        fromMonth: firstOf(from),
                        status: state!,
                        reason: reason.trim(),
                      }),
                    `صار ${m.fullName}: ${STATE_LABEL[state!]}`,
                  );
                }}
              >
                غيّر الحالة
              </button>
              <button
                type="button"
                className="bq-btn bq-btn-ghost bq-press"
                onClick={() => go("view")}
              >
                رجوع
              </button>
            </div>
            <OfflineWriteHint />
          </div>
        </>
      )}

      {mode === "state" && confirming && state && (
        <div className="bq-rej bq-small-top">
          <p className="bq-rej-l">{state === "deceased" ? "رحمه الله." : "تأكيد المغادرة"}</p>
          <p className="bq-lead">
            لن تُحسب على {m.fullName} رسوم من {ymLabel(from)}، ولن يظهر في قوائم الأعضاء العامة.
            يبقى سجلّه ودفعاته السابقة كما هي.
          </p>
          <Err text={err} />
          <div className="bq-slip-btns bq-small-top">
            <button
              type="button"
              className="bq-btn bq-btn-tonal bq-press"
              disabled={busy || !online}
              onClick={() =>
                run(
                  () =>
                    changeMemberStatus({
                      memberId: m.memberId,
                      fromMonth: firstOf(from),
                      status: state,
                      reason: reason.trim(),
                    }),
                  `حُدّثت حالة ${m.fullName}`,
                )
              }
            >
              نعم، غيّر الحالة
            </button>
            <button
              type="button"
              className="bq-btn bq-btn-ghost bq-press"
              onClick={() => setConfirming(false)}
            >
              رجوع
            </button>
          </div>
        </div>
      )}

      {mode === "move" && (
        <>
          <p className="bq-lead bq-small-top">
            يبقى رقمه <Num>{memberCode(m)}</Num> في قائمته. تتغيّر رسومه الشهرية إلى رسوم الفئة{" "}
            {groupLabel(other)} ابتداءً من الشهر الذي تختاره.
          </p>
          <p className="bq-rec-k">ابتداءً من شهر</p>
          <MonthField value={from} onChange={setFrom} label="من شهر" />
          <p className="bq-rec-k">السبب (اختياري)</p>
          <input
            className="bq-input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-label="سبب النقل"
          />
          <div className="bq-rec-foot">
            <Err text={err} />
            <div className="bq-slip-btns">
              <button
                type="button"
                className="bq-btn bq-btn-primary bq-press"
                disabled={busy || !online}
                onClick={() =>
                  run(
                    () =>
                      changeMemberGroup({
                        memberId: m.memberId,
                        fromMonth: firstOf(from),
                        groupCode: other,
                        reason: reason.trim() || undefined,
                      }),
                    `صار ${m.fullName} في الفئة ${groupLabel(other)}`,
                  )
                }
              >
                انقل
              </button>
              <button
                type="button"
                className="bq-btn bq-btn-ghost bq-press"
                onClick={() => go("view")}
              >
                رجوع
              </button>
            </div>
            <OfflineWriteHint />
          </div>
        </>
      )}
    </div>
  );
}

type GF = "all" | "A" | "B";
type SF = "all" | State;

export function MembersAdmin({
  members: server,
  prices,
  thisMonth,
}: {
  members: MemberAdmin[];
  prices: Record<string, number>;
  thisMonth: string;
}) {
  const say = useSnack();
  const demo = useDemoState();
  const members = useMemo(
    () =>
      [...server, ...demo.members]
        .map((m) => ({ ...m, ...demo.memberPatch[m.memberId] }))
        .sort((a, b) => a.listCode.localeCompare(b.listCode) || a.number - b.number),
    [server, demo.members, demo.memberPatch],
  );
  const [q, setQ] = useState("");
  const [g, setG] = useState<GF>("all");
  const [st, setSt] = useState<SF>("all");
  const [sheet, setSheet] = useState<{ t: "add" } | { t: "member"; id: string } | null>(null);
  const list = (q.trim() ? searchMembers(members, q) : members).filter(
    (m) => (g === "all" || m.listCode === g) && (st === "all" || m.status === st),
  );
  const count = (s: SF) =>
    members.filter((m) => (g === "all" || m.listCode === g) && (s === "all" || m.status === s))
      .length;
  const open = sheet?.t === "member" ? members.find((m) => m.memberId === sheet.id) : null;
  const done = (t: string) => {
    setSheet(null);
    say(t);
  };
  return (
    <>
      <button
        type="button"
        className="bq-btn bq-btn-primary bq-btn-lg bq-press"
        onClick={() => setSheet({ t: "add" })}
      >
        {I.plus(20)} إضافة عضو
      </button>
      <div className="bq-gap-12" />
      <label className="bq-search">
        {I.search(24)}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="الاسم أو الرقم، مثل B-12"
          aria-label="ابحث عن عضو"
          type="search"
        />
      </label>
      <div className="bq-gap-12" />
      <Segmented<GF>
        label="القائمة"
        value={g}
        onChange={setG}
        items={[
          { k: "all", l: "كل القوائم" },
          { k: "A", l: "قائمة A" },
          { k: "B", l: "قائمة B" },
        ]}
      />
      <div className="bq-gap-12" />
      <Segmented<SF>
        label="الحالة"
        value={st}
        onChange={setSt}
        items={[
          {
            k: "all",
            l: (
              <>
                الكل <Num className="bq-seg-n">{count("all")}</Num>
              </>
            ),
          },
          ...STATES.map((s) => ({
            k: s as SF,
            l: (
              <>
                {STATE_LABEL[s]} <Num className="bq-seg-n">{count(s)}</Num>
              </>
            ),
          })),
        ]}
      />
      {list.length ? (
        <ul className="bq-list bq-gap-top">
          {list.map((m) => (
            <li key={m.memberId}>
              <button
                type="button"
                className="bq-row bq-press"
                onClick={() => setSheet({ t: "member", id: m.memberId })}
                aria-label={`${memberCode(m)}، ${m.fullName}`}
              >
                <Avatar code={memberCode(m)} />
                <span className="bq-row-m">
                  <span className="bq-row-t">{m.fullName}</span>
                  <span className="bq-row-s">
                    الفئة {groupLabel(m.groupCode)}
                    {m.phone ? " · له رقم هاتف" : ""}
                  </span>
                </span>
                <StatusTag m={m} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="bq-hint bq-gap-top">لا أحد في هذه القائمة.</p>
      )}

      {sheet?.t === "add" && (
        <Sheet key="add" label="إضافة عضو" onDone={() => setSheet(null)}>
          <AddMemberBody members={members} prices={prices} thisMonth={thisMonth} onDone={done} />
        </Sheet>
      )}
      {open && (
        <Sheet key={open.memberId} label={open.fullName} onDone={() => setSheet(null)}>
          <MemberAdminBody m={open} thisMonth={thisMonth} onDone={done} />
        </Sheet>
      )}
    </>
  );
}
