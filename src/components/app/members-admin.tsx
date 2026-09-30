"use client";
import { failure } from "@/lib/data/errors";
import { toWesternDigits } from "@/lib/money";
// A new member and one member's details and state (the sheets of «الأعضاء», «المسؤول» only).
// Two paper lists, each numbered from 1 (A-12, B-12). States: نشط · معفى · غادر.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { OfflineWriteHint, useOnline } from "@/components/providers";
import { type MemberAdmin, type SettableStatus } from "@/lib/data/types";
import { useAct } from "./act";
import { MemberMonths } from "./member";
import { sendOnce, useOnceId } from "./once-id";
import { Avatar, MemberNo } from "./bits";
import {
  fmt,
  groupLabel,
  statusLabel,
  monthCount,
  monthsLabel,
  MONTHS,
  nextFreeNumber,
  STATE_CHOICES,
  STATE_LABEL,
} from "./derive";
import { MonthPicker } from "./date-field";
import { I } from "./icons";
import { Num } from "./num";
import { radioKeys, radioTab } from "./radio-keys";

type State = SettableStatus;
const STATES = STATE_CHOICES;
const LISTS = ["A", "B"] as const;

/** "YYYY-MM" (month input) → "YYYY-MM-01" (action input). */
const firstOf = (ym: string) => `${ym}-01`;
/** «من يوليو إلى سبتمبر 2026», one run per year. */
function creditMonthsLabel(keys: string[]) {
  const by = new Map<number, number[]>();
  for (const k of keys) {
    const y = Number(k.slice(0, 4));
    by.set(y, [...(by.get(y) ?? []), Number(k.slice(5, 7))]);
  }
  return [...by].map(([y, ms]) => `${monthsLabel(ms)} ${y}`).join("، ");
}
const ymLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};

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
      <p className="bq-rec-k">الاسم الكامل</p>
      <input
        className="bq-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="الاسم الكامل"
      />
      <p className="bq-rec-k">الفئة</p>
      <div className="bq-chips" role="radiogroup" onKeyDown={radioKeys} aria-label="الفئة">
        {LISTS.map((g, i, all) => (
          <button
            key={g}
            type="button"
            role="radio"
            aria-checked={list === g}
            tabIndex={radioTab(
              list === g,
              i,
              all.some((y) => y === list),
            )}
            className="bq-chip bq-press"
            onClick={() => pickList(g)}
          >
            الفئة {groupLabel(g)}
            {prices[g] ? (
              <>
                {" "}
                · <Num>{fmt(prices[g])}</Num>
              </>
            ) : null}
          </button>
        ))}
      </div>
      <p className="bq-rec-k">الرقم</p>
      <div className="bq-field">
        <span className="bq-strong">{groupLabel(list)}</span>
        <input
          className="bq-input"
          value={num}
          onChange={(e) => setNum(toWesternDigits(e.target.value).replace(/[^\d]/g, ""))}
          inputMode="numeric"
          dir="ltr"
          aria-label="رقم العضو"
        />
      </div>
      <p className="bq-hint">
        {taken ? "هذا الرقم مأخوذ في هذه الفئة." : "أول رقم فارغ، غيّره إن شئت."}
      </p>
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
      <p className="bq-rec-k">أول شهر تُحسب عليه المستحقات</p>
      <MonthPicker value={from} onChange={setFrom} label="أول شهر" />
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
            onDone(`أُضيف ${name.trim()} برقم ${groupLabel(list)} ${n}`);
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
  members = [],
  thisMonth,
  admin = false,
  credit,
  price = 0,
  months,
  monthsCtx,
  onDone,
}: {
  m: MemberAdmin;
  /** this year's month code (same cells as the public member sheet) */
  months?: string;
  monthsCtx?: { year: number; dueMonth: number };
  /** admin only: «تراجع عن آخر تغيير», «تصحيح شهر الانضمام» */
  admin?: boolean;
  /** the member's credit, when they have some */
  credit?: MemberCredit;
  /** this year's monthly fee of the member's group (how many months the credit pays) */
  price?: number;
  /** everyone, to say at once when a new number is taken */
  members?: MemberAdmin[];
  thisMonth: string;
  onDone: (t: string) => void;
}) {
  const router = useRouter();
  const online = useOnline();
  const {
    updateMember,
    changeMemberStatus,
    changeMemberGroup,
    cancelLastPeriod,
    setJoinMonth,
    applyCredit,
  } = useAct();
  const once = useOnceId();
  const [mode, setMode] = useState<"view" | "edit" | "state" | "move" | "undo" | "join" | "credit">(
    "view",
  );
  // the late months the credit pays, oldest first (the server checks each month's own price)
  const payable =
    credit && price > 0 ? credit.months.slice(0, Math.floor(credit.amount / price)) : [];
  const [joinYm, setJoinYm] = useState(m.joinedMonth?.slice(0, 7) ?? thisMonth);
  const [name, setName] = useState(m.fullName);
  const [phone, setPhone] = useState(m.phone ?? "");
  const [note, setNote] = useState(m.note ?? "");
  const [numTxt, setNumTxt] = useState(String(m.number));
  const num = Number(numTxt);
  const numTaken =
    num !== m.number &&
    members.some((x) => x.listCode === m.listCode && x.number === num && x.memberId !== m.memberId);
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
    const r = await f()
      .catch(() => failure("network"))
      .finally(() => setBusy(false));
    if (!r.ok) return setErr(r.message ?? "");
    router.refresh();
    onDone(done);
  };

  return (
    <div className="bq-rec">
      <div className="bq-mhead">
        <Avatar m={m} size={56} />
        <div>
          <h2>{m.fullName}</h2>
          <p className="bq-hint">
            رقم <MemberNo m={m} /> · الفئة {groupLabel(m.groupCode)} ·{" "}
            {STATE_LABEL[m.status as State] ?? m.status}
          </p>
        </div>
      </div>
      {months !== undefined && monthsCtx ? (
        // the same count line and month cells as the public member sheet (audit C7)
        <>
          <MemberMonths m={{ ...m, months }} ctx={monthsCtx} />
          {m.status === "active" && m.monthsBehind > 0 && (
            <p className="bq-hint bq-small-top">
              عليه حتى الآن <Num>{fmt(m.amountOwed)}</Num> أوقية
            </p>
          )}
        </>
      ) : (
        <p className="bq-mline">
          {m.status === "active" ? (
            <>
              {statusLabel(m)}
              {m.monthsBehind > 0 && (
                <span className="bq-row-s">
                  عليه حتى الآن <Num>{fmt(m.amountOwed)}</Num> أوقية
                </span>
              )}
            </>
          ) : (
            "لا تُحسب عليه مستحقات الآن."
          )}
        </p>
      )}
      {!!m.formerDebtMonths?.length && (
        <p className="bq-mline">
          عليه مستحقات شهرية سابقة لم تُدفع: {monthCount(m.formerDebtMonths.length)} ·{" "}
          <Num>{fmt(m.formerDebtAmount ?? 0)}</Num> أوقية
        </p>
      )}
      {!!credit?.amount && (
        <p className="bq-hint">
          له رصيد <Num>{fmt(credit.amount)}</Num> أوقية
          {payable.length ? "." : "، لا يكفي لشهر كامل."}
        </p>
      )}
      {m.phone ? (
        <a className="bq-link bq-press" href={`tel:${m.phone}`}>
          {I.phone(18)}
          <bdi dir="ltr" className="bq-num">
            {m.phone}
          </bdi>
        </a>
      ) : (
        <p className="bq-hint">لا رقم هاتف. أضِفه من «تعديل البيانات» ليصله التذكير.</p>
      )}

      {mode === "view" && (
        <div className="bq-btn-col bq-small-top">
          <button type="button" className="bq-btn bq-btn-soft bq-press" onClick={() => go("edit")}>
            تعديل البيانات
          </button>
          <button type="button" className="bq-btn bq-btn-soft bq-press" onClick={() => go("state")}>
            تغيير الحالة
          </button>
        </div>
      )}
      {mode === "view" && payable.length > 0 && (
        <button type="button" className="bq-btn bq-btn-tonal bq-press" onClick={() => go("credit")}>
          ادفع من الرصيد
        </button>
      )}
      {mode === "credit" && (
        <div className="bq-rej bq-small-top">
          <p className="bq-rej-l">ادفع من الرصيد</p>
          <p className="bq-lead">
            تُدفع مستحقات {monthCount(payable.length, "obl")} ({creditMonthsLabel(payable)}) من رصيد{" "}
            {m.fullName}: <Num>{fmt(payable.length * price)}</Num> أوقية. لا يدخل مال جديد إلى
            الصندوق.
          </p>
          <Err text={err} />
          <div className="bq-slip-btns bq-small-top">
            <button
              type="button"
              className="bq-btn bq-btn-primary bq-press"
              disabled={busy || !online}
              onClick={() =>
                run(
                  // the same id on every retry: the server replays instead of paying twice
                  () =>
                    sendOnce(once, (id) =>
                      applyCredit({
                        id,
                        memberId: m.memberId,
                        months: payable.map((k) => ({
                          year: Number(k.slice(0, 4)),
                          month: Number(k.slice(5, 7)),
                        })),
                      }),
                    ),
                  `دُفعت مستحقات ${monthCount(payable.length, "obl")} من رصيد ${m.fullName}`,
                )
              }
            >
              ادفع {monthCount(payable.length, "obl")}
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
      )}
      {mode === "view" && (
        // rare changes as clear 44px rows, not small run-together links (audit C7)
        <section className="bq-madm-more" aria-labelledby="bq-madm-more-h">
          <h3 id="bq-madm-more-h" className="bq-pick-h">
            تعديلات أخرى
          </h3>
          <ul className="bq-list bq-menu">
            <li>
              <button type="button" className="bq-row bq-press" onClick={() => go("move")}>
                <span className="bq-row-t">نقله إلى مستحقات الفئة {groupLabel(other)}</span>
                <span className="bq-chev">{I.go(18)}</span>
              </button>
            </li>
            {admin && (
              <>
                <li>
                  <button type="button" className="bq-row bq-press" onClick={() => go("undo")}>
                    <span className="bq-row-t">تراجع عن آخر تغيير</span>
                    <span className="bq-chev">{I.go(18)}</span>
                  </button>
                </li>
                <li>
                  <button type="button" className="bq-row bq-press" onClick={() => go("join")}>
                    <span className="bq-row-t">تصحيح شهر الانضمام</span>
                    <span className="bq-chev">{I.go(18)}</span>
                  </button>
                </li>
              </>
            )}
          </ul>
        </section>
      )}

      {mode === "undo" && (
        <div className="bq-rej bq-small-top">
          <p className="bq-rej-l">تراجع عن آخر تغيير</p>
          <p className="bq-lead">
            يُلغى آخر تغيير في حالة {m.fullName} أو مجموعته، ويعود كما كان قبله. لا يمكن ذلك إذا
            كانت فيه أشهر مدفوعة.
          </p>
          <p className="bq-rec-k">السبب</p>
          <input
            className="bq-input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="مثل: اختير «غادر» بالخطأ"
            aria-label="سبب التراجع"
          />
          <Err text={err} />
          <div className="bq-slip-btns bq-small-top">
            <button
              type="button"
              className="bq-btn bq-btn-tonal bq-press"
              disabled={!reason.trim() || busy || !online}
              onClick={() =>
                run(
                  () => cancelLastPeriod({ memberId: m.memberId, reason: reason.trim() }),
                  `أُلغي آخر تغيير لـ ${m.fullName}`,
                )
              }
            >
              نعم، تراجع
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
      )}

      {mode === "join" && (
        <>
          <p className="bq-lead bq-small-top">
            الأشهر قبل شهر الانضمام لا تُحسب عليه.
            {m.joinedMonth ? ` المسجَّل الآن: ${ymLabel(m.joinedMonth.slice(0, 7))}.` : ""}
          </p>
          <p className="bq-rec-k">انضم في شهر</p>
          <MonthPicker value={joinYm} onChange={setJoinYm} label="شهر الانضمام" />
          <p className="bq-rec-k">السبب</p>
          <input
            className="bq-input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="مثل: خطأ عند نقل الورقة"
            aria-label="سبب التصحيح"
          />
          <div className="bq-rec-foot">
            <Err text={err} />
            <div className="bq-slip-btns">
              <button
                type="button"
                className="bq-btn bq-btn-primary bq-press"
                disabled={!reason.trim() || busy || !online}
                onClick={() =>
                  run(
                    () =>
                      setJoinMonth({
                        memberId: m.memberId,
                        fromMonth: firstOf(joinYm),
                        reason: reason.trim(),
                      }),
                    `صُحّح شهر انضمام ${m.fullName}: ${ymLabel(joinYm)}`,
                  )
                }
              >
                صحّح الشهر
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

      {mode === "edit" && (
        <>
          <p className="bq-rec-k">الاسم الكامل</p>
          <input
            className="bq-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="الاسم الكامل"
          />
          <p className="bq-rec-k">الرقم</p>
          <div className="bq-field">
            <span className="bq-strong">{groupLabel(m.listCode)}</span>
            <input
              className="bq-input"
              value={numTxt}
              onChange={(e) => setNumTxt(toWesternDigits(e.target.value).replace(/[^\d]/g, ""))}
              inputMode="numeric"
              dir="ltr"
              aria-label="رقم العضو"
              aria-describedby="bq-num-h"
            />
          </div>
          {numTaken && (
            <p className="bq-hint" id="bq-num-h">
              هذا الرقم مأخوذ في هذه الفئة. لتبديل رقمين: اختر رقمًا غير مستخدم، ثم غيّر الرقم
              الآخر.
            </p>
          )}
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
                disabled={name.trim().length < 3 || !(num > 0) || numTaken || busy || !online}
                onClick={() =>
                  run(
                    () =>
                      updateMember({
                        memberId: m.memberId,
                        fullName: name.trim(),
                        phone: phone.trim() || null,
                        note: note.trim() || null,
                        number: num !== m.number ? num : undefined,
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
          <div className="bq-chips" role="radiogroup" onKeyDown={radioKeys} aria-label="الحالة">
            {STATES.filter((s) => s !== m.status).map((s, i, all) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={state === s}
                tabIndex={radioTab(
                  state === s,
                  i,
                  all.some((y) => y === state),
                )}
                className="bq-chip bq-press"
                onClick={() => setState(s)}
              >
                {STATE_LABEL[s]}
              </button>
            ))}
          </div>
          <p className="bq-rec-k">ابتداءً من شهر</p>
          <MonthPicker value={from} onChange={setFrom} label="من شهر" />
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
            {!err && (!state || !reason.trim()) && (
              <p className="bq-hint" id="bq-state-need">
                {!state ? "اختر الحالة الجديدة." : "اكتب السبب ليُحفظ في السجل."}
              </p>
            )}
            <div className="bq-slip-btns">
              <button
                type="button"
                className="bq-btn bq-btn-primary bq-press"
                disabled={!state || !reason.trim() || busy || !online}
                aria-describedby="bq-state-need"
                onClick={() => {
                  if (state === "left") return setConfirming(true);
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
          <p className="bq-rej-l">تأكيد المغادرة</p>
          <p className="bq-lead">
            لن تُحسب على {m.fullName} مستحقات من {ymLabel(from)}، ولن يظهر في قوائم الأعضاء العامة.
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
            يبقى رقمه <MemberNo m={m} /> كما هو. تتغيّر مستحقاته الشهرية إلى مستحقات الفئة{" "}
            {groupLabel(other)} ابتداءً من الشهر الذي تختاره.
          </p>
          <p className="bq-rec-k">ابتداءً من شهر</p>
          <MonthPicker value={from} onChange={setFrom} label="من شهر" />
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

/** A member's credit and their late months ("YYYY-MM", oldest first) it could pay. */
export type MemberCredit = { amount: number; months: string[] };
