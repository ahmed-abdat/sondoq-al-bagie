"use client";
// «تسليم الصندوق»: the outgoing committee counts the money it hands over (per wallet + cash),
// says who stays on the committee, and submits; an admin who did not submit accepts, which
// starts the next term («الدورة N»). One page, calm steps, no red for a difference.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { OfflineWriteHint, useOnline } from "@/components/providers";
import type { CommitteeAccount, CountedLine, FundAccountAdmin, Handover } from "@/lib/data/types";
import { METHOD_LABELS } from "@/lib/methods";
import { parseAmount, toWesternDigits } from "@/lib/money";
import { waLink } from "@/lib/whatsapp";
import { useAct, useDemoState } from "./act";
import { dayDate, fmt, ROLE_LABEL } from "./derive";
import { I } from "./icons";
import { Num } from "./num";
import { Stamp } from "./receipt";

type Line = CountedLine & { key: string; text: string };

const diffWords = (d: number) =>
  d === 0
    ? "مطابق للحساب"
    : d > 0
      ? `زائد ${fmt(d)} أوقية عن الحساب`
      : `ناقص ${fmt(-d)} أوقية عن الحساب`;

function initialLines(h: Handover, accounts: FundAccountAdmin[]): Line[] {
  if (h.countedLines.length)
    return h.countedLines.map((l, i) => ({ ...l, key: `s${i}`, text: String(l.amount) }));
  return [
    ...accounts
      .filter((a) => a.active)
      .map((a) => ({
        key: a.id,
        label: `${METHOD_LABELS[a.method]} · ${a.accountNumber}`,
        method: a.method,
        accountId: a.id,
        amount: 0,
        text: "",
      })),
    { key: "cash", label: "نقدًا", method: "cash" as const, accountId: null, amount: 0, text: "" },
  ];
}

/** «محضر التسليم» as plain text for WhatsApp. */
function minutesText(h: Handover, termNo: number) {
  return [
    "*محضر تسليم صندوق البقيع*",
    `انتهت الدورة ${h.fromTerm} وبدأت الدورة ${termNo}.`,
    `المبلغ في التطبيق: ${fmt(h.computedBalance ?? h.liveBalance)} أوقية`,
    `المبلغ المسلَّم: ${fmt(h.countedBalance ?? 0)} أوقية`,
    ...h.countedLines.map((l) => `• ${l.label}: ${fmt(l.amount)}`),
    `الفرق: ${diffWords(h.difference ?? (h.countedBalance ?? 0) - (h.computedBalance ?? h.liveBalance))}`,
    h.submittedByName ? `سلّمه: ${h.submittedByName}` : "",
    h.acceptedByName ? `استلمه: ${h.acceptedByName}` : "",
    h.note ? `ملاحظة: ${h.note}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function HandoverView({
  handover: server,
  balance,
  termNumber,
  accounts,
  people,
  me,
}: {
  handover: Handover | null;
  /** app balance now */
  balance: number;
  termNumber: number;
  accounts: FundAccountAdmin[];
  people: CommitteeAccount[];
  me: { name: string; admin: boolean };
}) {
  const router = useRouter();
  const online = useOnline();
  const act = useAct();
  const demo = useDemoState();
  const h = demo.handover ?? server;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const run = async (f: () => Promise<{ ok: boolean; message?: string }>) => {
    setBusy(true);
    setErr("");
    const r = await f();
    setBusy(false);
    if (!r.ok) {
      setErr(r.message ?? "");
      return false;
    }
    router.refresh();
    return true;
  };

  if (!h || h.status === "cancelled")
    return (
      <section className="bq-sec bq-sec-first">
        {h?.status === "cancelled" && (
          <p className="bq-hint">
            أُلغي التسليم السابق{h.cancelReason ? `: ${h.cancelReason}` : ""}.
          </p>
        )}
        <p className="bq-lead">
          عند انتهاء دورة اللجنة، تعدّ اللجنة الحالية المال الموجود وتسلّمه للجنة الجديدة. يقبله
          مسؤول آخر، فتبدأ الدورة {termNumber + 1}.
        </p>
        <ol className="bq-steps bq-small-top">
          {[
            "عدّ المال في كل محفظة ونقدًا.",
            "اختر من يبقى في اللجنة.",
            "أرسل للتسليم، ويقبله المسؤول الجديد.",
          ].map((t, i) => (
            <li key={t}>
              <span className="bq-step-n">
                <Num>{i + 1}</Num>
              </span>
              <p>{t}</p>
            </li>
          ))}
        </ol>
        {err && (
          <p className="bq-alert" role="alert">
            {err}
          </p>
        )}
        <button
          type="button"
          className="bq-btn bq-btn-primary bq-btn-lg bq-press"
          disabled={busy || !online}
          onClick={() => run(() => act.startHandover({ id: crypto.randomUUID() }))}
        >
          ابدأ التسليم
        </button>
        <OfflineWriteHint />
      </section>
    );

  if (h.status === "draft")
    return (
      <Draft
        key={h.id}
        h={h}
        balance={balance}
        accounts={accounts}
        people={people}
        run={run}
        busy={busy}
        err={err}
      />
    );

  if (h.status === "submitted")
    return (
      <Submitted
        h={h}
        balance={balance}
        termNumber={termNumber}
        me={me}
        run={run}
        busy={busy}
        err={err}
      />
    );

  // confirmed
  const next = h.toTerm ?? termNumber;
  const text = minutesText(h, next);
  return (
    <section className="bq-sec bq-sec-first bq-rec-done">
      <Stamp variant="confirmed" date={h.acceptedAt ?? new Date().toISOString()} size={112} press />
      <h2>بدأت الدورة {next}</h2>
      <p className="bq-lead">
        استلم {h.acceptedByName ?? "المسؤول الجديد"} الصندوق
        {h.acceptedAt ? ` يوم ${dayDate(h.acceptedAt)}` : ""}.
      </p>
      <Summary h={h} computed={h.computedBalance ?? balance} />
      <div className="bq-share">
        <a
          className="bq-btn bq-btn-primary bq-press"
          href={waLink(null, text)}
          target="_blank"
          rel="noopener noreferrer"
        >
          {I.wa(20)} أرسل محضر التسليم عبر واتساب
        </a>
        <button
          type="button"
          className="bq-btn bq-btn-ghost bq-press"
          onClick={() => navigator.clipboard?.writeText(text).catch(() => {})}
        >
          {I.copy(18)} نسخ المحضر
        </button>
      </div>
    </section>
  );
}

function Summary({ h, computed }: { h: Handover; computed: number }) {
  const counted = h.countedBalance ?? h.countedLines.reduce((t, l) => t + l.amount, 0);
  const d = h.difference ?? counted - computed;
  return (
    <dl className="bq-facts bq-ho-sum">
      <div>
        <dt>في التطبيق</dt>
        <dd>
          <Num>{fmt(computed)}</Num> أوقية
        </dd>
      </div>
      <div>
        <dt>المسلَّم فعلًا</dt>
        <dd>
          <Num>{fmt(counted)}</Num> أوقية
        </dd>
      </div>
      <div className="is-wide">
        <dt>الفرق</dt>
        <dd>{diffWords(d)}</dd>
      </div>
      {h.countedLines.map((l) => (
        <div key={l.label} className="is-wide">
          <dt>{l.label}</dt>
          <dd>
            <Num>{fmt(l.amount)}</Num>
          </dd>
        </div>
      ))}
      {h.note && (
        <div className="is-wide">
          <dt>ملاحظة</dt>
          <dd>{h.note}</dd>
        </div>
      )}
    </dl>
  );
}

type RunFn = (f: () => Promise<{ ok: boolean; message?: string }>) => Promise<boolean>;

function Draft({
  h,
  balance,
  accounts,
  people,
  run,
  busy,
  err,
}: {
  h: Handover;
  balance: number;
  accounts: FundAccountAdmin[];
  people: CommitteeAccount[];
  run: RunFn;
  busy: boolean;
  err: string;
}) {
  const online = useOnline();
  const act = useAct();
  const [lines, setLines] = useState<Line[]>(() => initialLines(h, accounts));
  const [stay, setStay] = useState<Set<string>>(
    () => new Set(h.carryOver.length ? h.carryOver : people.map((p) => p.userId)),
  );
  const [note, setNote] = useState(h.note ?? "");
  const [saved, setSaved] = useState(false);
  const counted = lines.reduce((t, l) => t + l.amount, 0);
  const d = counted - balance;
  const anyCounted = lines.some((l) => l.text.trim() !== "");
  const payload = () => ({
    id: h.id,
    countedLines: lines
      .filter((l) => l.label.trim() && l.text.trim() !== "")
      .map(({ label, method, accountId, amount }) => ({
        label: label.trim(),
        method: method ?? null,
        accountId: accountId ?? null,
        amount,
      })),
    carryOver: [...stay],
    note: note.trim() || undefined,
  });
  const setLine = (key: string, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  return (
    <>
      <ol className="bq-ho-progress" aria-label="خطوات التسليم">
        {["المتوقع", "المسلَّم", "اللجنة", "ملاحظة", "إرسال"].map((t, i) => (
          <li key={t} className={i < 2 || anyCounted ? "is-on" : ""}>
            {t}
          </li>
        ))}
      </ol>

      <section className="bq-sec bq-sec-first" aria-labelledby="ho-1">
        <h2 id="ho-1">1. المبلغ المتوقع</h2>
        <p className="bq-big">
          <Num>{fmt(balance)}</Num> <span>أوقية</span>
        </p>
        <p className="bq-hint">هذا ما يجب أن يكون في الصندوق حسب التطبيق.</p>
      </section>

      <section className="bq-sec" aria-labelledby="ho-2">
        <h2 id="ho-2">2. المبلغ المسلَّم فعلًا</h2>
        <p className="bq-lead">اكتب ما في كل محفظة وما هو نقدًا، بالأوقية القديمة.</p>
        <ul className="bq-ho-lines">
          {lines.map((l) => (
            <li key={l.key}>
              {l.accountId || l.key === "cash" ? (
                <span className="bq-ho-label">{l.label}</span>
              ) : (
                <input
                  className="bq-input"
                  value={l.label}
                  onChange={(e) => setLine(l.key, { label: e.target.value })}
                  placeholder="مثل: حساب آخر"
                  aria-label="اسم السطر"
                />
              )}
              <input
                className="bq-input bq-ho-amt"
                value={l.text}
                onChange={(e) => {
                  const text = toWesternDigits(e.target.value);
                  setLine(l.key, { text, amount: Math.max(0, Math.round(parseAmount(text) ?? 0)) });
                }}
                inputMode="numeric"
                dir="ltr"
                placeholder="0"
                aria-label={`المبلغ: ${l.label || "سطر"}`}
              />
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="bq-link bq-link-s bq-press"
          onClick={() =>
            setLines((ls) => [
              ...ls,
              {
                key: `n${Date.now()}`,
                label: "",
                method: null,
                accountId: null,
                amount: 0,
                text: "",
              },
            ])
          }
        >
          {I.plus(18)} إضافة سطر
        </button>
        <dl className="bq-sum bq-small-top">
          <div className="is-total">
            <dt>المجموع المسلَّم</dt>
            <dd>
              <Num>{fmt(counted)}</Num> <span className="bq-unit">أوقية</span>
            </dd>
          </div>
        </dl>
        {anyCounted && <p className={`bq-ho-diff ${d === 0 ? "is-ok" : ""}`}>{diffWords(d)}</p>}
        {anyCounted && d !== 0 && (
          <p className="bq-hint">
            لا بأس بالفرق؛ يُسجَّل «فرق عند التسليم» ويظهر للجميع. اكتب سببه في الملاحظة.
          </p>
        )}
      </section>

      <section className="bq-sec" aria-labelledby="ho-3">
        <h2 id="ho-3">3. من يبقى في اللجنة</h2>
        {people.length ? (
          <ul className="bq-list">
            {people.map((p) => (
              <li key={p.userId}>
                <label className="bq-row bq-ho-person">
                  <input
                    type="checkbox"
                    checked={stay.has(p.userId)}
                    onChange={(e) =>
                      setStay((s) => {
                        const n = new Set(s);
                        if (e.target.checked) n.add(p.userId);
                        else n.delete(p.userId);
                        return n;
                      })
                    }
                  />
                  <span className="bq-row-m">
                    <span className="bq-row-t">{p.displayName}</span>
                    <span className="bq-row-s">{ROLE_LABEL[p.role]}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <p className="bq-hint">لا توجد حسابات لجنة أخرى.</p>
        )}
        <p className="bq-hint">
          من لا يبقى يُوقف حسابه عند قبول التسليم. أضف أعضاء اللجنة الجديدة من «حسابات اللجنة» في
          الإعدادات.
        </p>
      </section>

      <section className="bq-sec" aria-labelledby="ho-4">
        <h2 id="ho-4">4. ملاحظة (اختياري)</h2>
        <textarea
          className="bq-input bq-textarea"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          aria-label="ملاحظة التسليم"
          placeholder="مثل: 500 أوقية صُرفت نقدًا على الشاي يوم الاجتماع"
        />
      </section>

      <section className="bq-sec" aria-labelledby="ho-5">
        <h2 id="ho-5">5. إرسال للتسليم</h2>
        <p className="bq-lead">
          بعد الإرسال لا يمكن التعديل. يقبله مسؤول آخر فتبدأ الدورة الجديدة.
        </p>
        {err && (
          <p className="bq-alert" role="alert">
            {err}
          </p>
        )}
        <div className="bq-btn-col">
          <button
            type="button"
            className="bq-btn bq-btn-primary bq-btn-lg bq-press"
            disabled={busy || !online || !anyCounted}
            onClick={async () => {
              if (await run(() => act.updateHandoverDraft(payload())))
                await run(() => act.submitHandover({ id: h.id }));
            }}
          >
            {busy ? "جارٍ الإرسال…" : "إرسال للتسليم"}
          </button>
          <button
            type="button"
            className="bq-btn bq-btn-ghost bq-press"
            disabled={busy || !online}
            onClick={async () => setSaved(await run(() => act.updateHandoverDraft(payload())))}
          >
            {saved ? "حُفظت المسودة" : "احفظ وأكمل لاحقًا"}
          </button>
        </div>
        {!anyCounted && <p className="bq-hint">اكتب المبلغ في سطر واحد على الأقل.</p>}
        <OfflineWriteHint />
      </section>
    </>
  );
}

function Submitted({
  h,
  balance,
  termNumber,
  me,
  run,
  busy,
  err,
}: {
  h: Handover;
  balance: number;
  termNumber: number;
  me: { name: string; admin: boolean };
  run: RunFn;
  busy: boolean;
  err: string;
}) {
  const online = useOnline();
  const act = useAct();
  const [title, setTitle] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const canAccept = me.admin && h.submittedByName !== me.name && h.startedByName !== me.name;
  const next = termNumber + 1;
  return (
    <section className="bq-sec bq-sec-first">
      <div className="bq-verify-s is-none">
        <span className="bq-verify-i">{I.clock(32)}</span>
        <h2>بانتظار قبول المسؤول الجديد</h2>
        <p className="bq-lead">
          أرسله {h.submittedByName ?? "اللجنة"}
          {h.submittedAt ? ` يوم ${dayDate(h.submittedAt)}` : ""}.
        </p>
      </div>
      <Summary h={h} computed={h.computedBalance ?? (h.liveBalance || balance)} />
      {err && (
        <p className="bq-alert" role="alert">
          {err}
        </p>
      )}
      {canAccept && !confirming && !cancelling && (
        <button
          type="button"
          className="bq-btn bq-btn-primary bq-btn-lg bq-press"
          onClick={() => setConfirming(true)}
        >
          قبول التسليم وبدء الدورة {next}
        </button>
      )}
      {!canAccept && <p className="bq-hint">يقبله مسؤول آخر غير من أرسله.</p>}
      {confirming && (
        <div className="bq-rej">
          <p className="bq-rej-l">هل استلمت المبلغ المسلَّم فعلًا؟</p>
          <p className="bq-lead">بعد القبول تبدأ الدورة {next}، ويُسجَّل الفرق إن وُجد.</p>
          <input
            className="bq-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={`اسم الدورة (اختياري)، مثل الدورة ${next}`}
            aria-label="اسم الدورة الجديدة"
          />
          <div className="bq-slip-btns bq-small-top">
            <button
              type="button"
              className="bq-btn bq-btn-primary bq-press"
              disabled={busy || !online}
              onClick={() =>
                run(() => act.acceptHandover({ id: h.id, newTermTitle: title.trim() || undefined }))
              }
            >
              نعم، استلمت
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
      {!confirming &&
        (cancelling ? (
          <div className="bq-rej">
            <p className="bq-rej-l">لماذا يُلغى التسليم؟</p>
            <input
              className="bq-input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="مثل: نعيد العدّ"
              aria-label="سبب الإلغاء"
            />
            <div className="bq-slip-btns bq-small-top">
              <button
                type="button"
                className="bq-btn bq-btn-tonal bq-press"
                disabled={!reason.trim() || busy || !online}
                onClick={() => run(() => act.cancelHandover({ id: h.id, reason: reason.trim() }))}
              >
                ألغِ التسليم
              </button>
              <button
                type="button"
                className="bq-btn bq-btn-ghost bq-press"
                onClick={() => setCancelling(false)}
              >
                رجوع
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="bq-link bq-link-quiet bq-press"
            onClick={() => setCancelling(true)}
          >
            إلغاء التسليم
          </button>
        ))}
      <OfflineWriteHint />
    </section>
  );
}
