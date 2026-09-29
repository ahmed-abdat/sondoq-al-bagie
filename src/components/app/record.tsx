"use client";
// «سجّل دفعة»: one transfer, for one member or several (a father for his sons, brothers…).
// Who (late months by default) → screenshot (fills method, amount, date, ref) → how → date.
// Transfer amount, ref, a different payer and a campaign sit in «تفاصيل أخرى», which opens by
// itself when something there needs a look. The footer says what will be saved; its one button
// either saves or names the missing step and takes you there. A bigger transfer keeps the rest
// as credit (for the only member, or the one chosen); a smaller one says by how much.
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { OfflineWriteHint, useOnline } from "@/components/providers";
import { compressImage, dataUrlToBlob } from "@/lib/compress-image";
import type { CampaignProgress, FundAccount, MemberRow, PaymentMethod } from "@/lib/data/types";
import { todayIso } from "@/lib/dates";
import { MAIN_METHODS, METHOD_LABELS, METHODS } from "@/lib/methods";
import { toWesternDigits } from "@/lib/money";
import { monthStates } from "@/lib/data/month-code";
import { readReceipt, terminateOcr, warmOcr, type ReceiptChecks } from "@/lib/ocr";
import { safeStorage } from "@/lib/safe-storage";
import { rememberMembers, useAct } from "./act";
import { sendOnce, useOnceId } from "./once-id";
import { failure } from "@/lib/data/errors";
import { ShareBtns } from "./entries";
import { Stamp } from "./receipt";
import type { ReceiptView } from "./receipt-model";
import { payableMonths, summarize, toRecordInput, type Draft, type Step } from "./payment-draft";
import { Avatar, MethodBadge, StatusTag } from "./bits";
import {
  byMostLate,
  dayWords,
  fmt,
  groupLabel,
  imageOpenError,
  MONTHS,
  monthsLabel,
  monthCount,
  searchMembers,
} from "./derive";
import { SearchField } from "./search-field";
import { Segmented } from "./segmented";
import { DateField } from "./date-field";
import { I } from "./icons";
import type { MemberCtx } from "./member";
import { Num, prefersReduced } from "./num";

const OTHER_METHODS: PaymentMethod[] = METHODS.filter(
  (m) => !MAIN_METHODS.includes(m) && m !== "paper",
);

type Row = { m: MemberRow; months: number[]; edit: boolean };

/** Default months: the owed ones that are due (late); if none, the whole rest of the year. */
function defaultMonths(ctx: MemberCtx, m: MemberRow) {
  const { open, late } = payableMonths(m.months, ctx.dueMonth);
  return late.length ? late : open;
}

const RECENT_KEY = "bq-recent-payers";
const readRecent = (): string[] => {
  try {
    const v = JSON.parse(safeStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 3) : [];
  } catch {
    return [];
  }
};
function rememberRecent(ids: string[]) {
  const next = [...new Set([...ids, ...readRecent()])].slice(0, 3);
  safeStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

function PickRow({
  m,
  onPick,
  dim,
  scoped,
}: {
  m: MemberRow;
  onPick: (m: MemberRow) => void;
  dim?: boolean;
  scoped?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        className={`bq-row bq-press ${dim ? "is-dim" : ""}`}
        onClick={() => onPick(m)}
      >
        <Avatar m={m} scoped={scoped} />
        <span className="bq-row-m">
          <span className="bq-row-t">{m.fullName}</span>
        </span>
        <StatusTag m={m} />
      </button>
    </li>
  );
}

/**
 * Step 1: the whole member list, ready to scroll and tap; the search at the top filters it
 * (name, «12», «ب 12», «B12», Arabic digits). Active members by group, exempt ones dimmed at the end.
 */
function MemberPicker({
  members,
  exclude,
  onPick,
  autoFocus,
}: {
  members: MemberRow[];
  exclude: Set<string>;
  onPick: (m: MemberRow) => void;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState("");
  const [recentIds] = useState(readRecent);
  const pool = useMemo(
    () =>
      members.filter(
        (m) => (m.status === "active" || m.status === "exempt") && !exclude.has(m.memberId),
      ),
    [members, exclude],
  );
  const [g, setG] = useState<"all" | "A" | "B">("all");
  const listOf = (m: MemberRow) => m.memberRef.split("-")[0];
  const allLists = [...new Set(pool.map(listOf))].sort();
  const res = useMemo(
    () =>
      (q.trim() ? searchMembers(pool, q) : pool).filter(
        (m) => g === "all" || m.memberRef.startsWith(`${g}-`),
      ),
    [pool, q, g],
  );
  const late = res.filter((m) => m.status === "active" && m.monthsBehind > 0).sort(byMostLate);
  const recent = q.trim()
    ? []
    : recentIds.map((id) => pool.find((m) => m.memberId === id)).filter((m): m is MemberRow => !!m);
  const onTime = res.filter((m) => m.status === "active" && m.monthsBehind === 0);
  const lists = [...new Set(onTime.map(listOf))].sort();
  const exempt = res.filter((m) => m.status === "exempt");
  return (
    <div className="bq-pick">
      <SearchField
        value={q}
        onChange={setQ}
        placeholder="الاسم أو الرقم، مثل ب 12"
        label="ابحث عن العضو"
        members={pool}
        onOpen={onPick}
        small
        autoFocus={autoFocus}
        className="bq-pick-search"
      />
      {allLists.length > 1 && (
        <div className="bq-pick-groups">
          <Segmented<"all" | "A" | "B">
            label="المجموعة"
            fit
            value={g}
            onChange={setG}
            items={[
              { k: "all", l: "الكل" },
              ...allLists.map((l) => ({
                k: l as "A" | "B",
                l: `المجموعة ${groupLabel(l)}`,
              })),
            ]}
          />
        </div>
      )}
      {q.trim() && !res.length && <p className="bq-hint">لم نجد عضوًا بهذا الاسم أو الرقم.</p>}
      {recent.length > 0 && (
        <section aria-label="آخر من سجّلت لهم">
          <h3 className="bq-pick-h">آخر من سجّلت لهم</h3>
          <ul className="bq-list">
            {recent.map((m) => (
              <PickRow key={`r-${m.memberId}`} m={m} onPick={onPick} />
            ))}
          </ul>
        </section>
      )}
      {late.length > 0 && (
        <section aria-label="المتأخرون">
          <h3 className="bq-pick-h">المتأخرون</h3>
          <ul className="bq-list">
            {late.map((m) => (
              <PickRow key={`l-${m.memberId}`} m={m} onPick={onPick} />
            ))}
          </ul>
        </section>
      )}
      {lists.map((l) => (
        <section key={l} aria-label={`المجموعة ${groupLabel(l)}`}>
          <h3 className="bq-pick-h">المجموعة {groupLabel(l)}</h3>
          <ul className="bq-list">
            {onTime
              .filter((m) => listOf(m) === l)
              .map((m) => (
                <PickRow key={m.memberId} m={m} onPick={onPick} scoped />
              ))}
          </ul>
        </section>
      ))}
      {exempt.length > 0 && (
        <section aria-label="المعفون">
          <h3 className="bq-pick-h">المعفون من الرسوم</h3>
          <ul className="bq-list">
            {exempt.map((m) => (
              <PickRow key={m.memberId} m={m} onPick={onPick} dim />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** «لعضوين / لـ 3 أعضاء» for the summary line. */
function forMembers(n: number) {
  if (n === 1) return "لعضو واحد";
  if (n === 2) return "لعضوين";
  return n <= 10 ? `لـ ${n} أعضاء` : `لـ ${n} عضوًا`;
}

function RowCard({
  row,
  ctx,
  price,
  onChange,
  onRemove,
  headRef,
}: {
  row: Row;
  ctx: MemberCtx;
  price: number;
  onChange: (r: Row) => void;
  onRemove?: () => void;
  headRef?: (el: HTMLElement | null) => void;
}) {
  const states = monthStates(row.m.months);
  const { open, late } = payableMonths(row.m.months, ctx.dueMonth);
  const same = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);
  const quick = [
    { k: "late", l: `المتأخرة${late.length ? ` (${late.length})` : ""}`, ms: late },
    { k: "year", l: "كل ما بقي من السنة", ms: open },
    { k: "one", l: "شهر واحد", ms: open.slice(0, 1) },
  ];
  return (
    <div className={`bq-rec-row ${row.edit ? "is-edit" : ""}`}>
      <div className="bq-rec-who">
        <Avatar m={row.m} />
        <span className="bq-row-m">
          <span className="bq-row-t" tabIndex={-1} ref={headRef}>
            {row.m.fullName}
          </span>
          <span className="bq-row-s">
            {row.months.length
              ? `${monthCount(row.months.length)}: ${monthsLabel(row.months)}`
              : open.length
                ? "لم تُختر أشهر"
                : states.some((x) => x === "paid")
                  ? "دفع رسوم هذا العام كاملة"
                  : "لا رسوم مستحقة عليه هذا العام"}
          </span>
        </span>
        {onRemove && (
          <button
            type="button"
            className="bq-icon-btn bq-press"
            onClick={onRemove}
            aria-label={`إزالة ${row.m.fullName}`}
          >
            {I.x(20)}
          </button>
        )}
      </div>
      {row.edit && (
        <div className="bq-rec-in">
          <div className="bq-chips" role="group" aria-label="اختيار سريع">
            {quick.map((o) => (
              <button
                key={o.k}
                type="button"
                className="bq-chip bq-press"
                aria-pressed={o.ms.length > 0 && same(row.months, o.ms)}
                disabled={!o.ms.length}
                onClick={() => onChange({ ...row, months: o.ms })}
              >
                {o.l}
              </button>
            ))}
          </div>
          <ol className="bq-mstrip" aria-label={`أشهر ${row.m.fullName}`}>
            {MONTHS.map((name, i) => {
              const k = i + 1;
              const isPaid = states[i] === "paid";
              const notOwed = states[i] === "not_owed";
              const on = row.months.includes(k);
              return (
                <li key={k}>
                  <button
                    type="button"
                    className={`bq-mpick bq-press ${isPaid || notOwed ? "is-paid" : ""}`}
                    aria-pressed={on}
                    disabled={isPaid || notOwed}
                    onClick={() =>
                      onChange({
                        ...row,
                        months: on
                          ? row.months.filter((x) => x !== k)
                          : [...row.months, k].sort((a, b) => a - b),
                      })
                    }
                  >
                    {name}
                    {isPaid && <span className="bq-mpick-s">مدفوع</span>}
                    {notOwed && <span className="bq-mpick-s">غير مستحق</span>}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      )}
      <div className="bq-rec-row-f">
        {open.length > 0 && (
          <button
            type="button"
            className="bq-link bq-link-s bq-press"
            aria-expanded={row.edit}
            onClick={() => onChange({ ...row, edit: !row.edit })}
          >
            {row.edit ? "تم" : "تغيير الأشهر"}
          </button>
        )}
        {row.months.length > 0 && price > 0 && (
          <span className="bq-rec-row-amt">
            <Num>{fmt(row.months.length * price)}</Num> أوقية
          </span>
        )}
      </div>
    </div>
  );
}

/** Fields the screenshot can fill; each carries a small «من الصورة» or «تحقق» mark. */
type ShotField = "method" | "txn" | "amount" | "date";

function Mark({ from, ok }: { from: boolean; ok: boolean }) {
  if (!from) return null;
  return ok ? (
    <span className="bq-tag bq-tag-inline bq-rec-mark">{I.image(16)} من الصورة</span>
  ) : (
    <span className="bq-tag is-late bq-tag-inline bq-rec-mark">{I.search(16)} تحقق</span>
  );
}

/** What still stops the save, in plain words, and the one step that fixes it. */
const STEP_CTA: Record<Step, string> = {
  months: "اختر الأشهر",
  method: "اختر كيف دفع",
  payer: "اكتب اسم الدافع",
  amount: "صحّح المبلغ",
  credit: "اختر لمن الباقي",
};

export function RecordBody({
  members,
  ctx,
  accounts,
  campaigns = [],
  me,
  onDone,
}: {
  members: MemberRow[];
  ctx: MemberCtx;
  /** the fund's wallets: the receipt reading checks the money went to one of them */
  accounts: FundAccount[];
  /** open campaigns: one transfer can also carry a contribution */
  campaigns?: CampaignProgress[];
  /** who records: printed on the receipt when the payment is confirmed at once */
  me?: { by: string; role: string };
  onDone: (text: string) => void;
}) {
  const router = useRouter();
  const online = useOnline();
  const { recordPayment, uploadProof } = useAct();
  const once = useOnceId();
  const [rows, setRows] = useState<Row[]>([]);
  const [adding, setAdding] = useState(true);
  const [payer, setPayer] = useState<string | null>(null); // null = the first member
  const [meth, setMeth] = useState<PaymentMethod | null>(null);
  const [moreMeth, setMoreMeth] = useState(false);
  const [txn, setTxn] = useState("");
  const [sentTxt, setSentTxt] = useState("");
  const [creditFor, setCreditFor] = useState<string | null>(null);
  const [shot, setShot] = useState<{ url: string; name: string } | null>(null);
  const [paidOn, setPaidOn] = useState(todayIso());
  const [camp, setCamp] = useState<string | null>(null);
  const [campTxt, setCampTxt] = useState("");
  const [more, setMore] = useState(false);
  const [reading, setReading] = useState(false);
  const [checks, setChecks] = useState<ReceiptChecks | null>(null);
  const [read, setRead] = useState<{ ok: boolean } | null>(null);
  const [fromShot, setFromShot] = useState<Set<ShotField>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirmed, setConfirmed] = useState<{ r: ReceiptView; text: string } | null>(null);
  const readSeq = useRef(0);
  const heads = useRef(new Map<string, HTMLElement>());
  const focusNext = useRef<string | null>(null);
  const methodRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const payerRef = useRef<HTMLInputElement>(null);
  const creditRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    void warmOcr();
    return () => void terminateOcr();
  }, []);
  // a newly added member: focus its name (keyboard and screen readers continue from there)
  useEffect(() => {
    const id = focusNext.current;
    if (!id) return;
    focusNext.current = null;
    const el = heads.current.get(id);
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: "nearest", behavior: prefersReduced() ? "auto" : "smooth" });
  }, [rows]);

  const priceOf = (m: MemberRow) => ctx.prices[m.groupCode] ?? 0;
  const openCamps = campaigns.filter((c) => c.status === "open");
  const payerName = (payer ?? rows[0]?.m.fullName ?? "").trim();
  const exclude = useMemo(() => new Set(rows.map((r) => r.m.memberId)), [rows]);
  const draft: Draft = {
    rows,
    prices: ctx.prices,
    method: meth,
    payerName,
    sentText: sentTxt,
    creditFor,
    campaignId: camp,
    campaignText: campTxt,
    year: ctx.year,
  };
  const { campAmt, total, sent, diff, creditTo, credit, block, fitMonths } = summarize(draft);
  // anything that needs a look inside «تفاصيل أخرى» opens it (and it stays open)
  if (!more && (diff !== 0 || (rows.length > 0 && !payerName))) setMore(true);

  const touched = (f: ShotField) =>
    setFromShot((s) => {
      if (!s.has(f)) return s;
      const n = new Set(s);
      n.delete(f);
      return n;
    });

  /** Bring a section into view and give it a short highlight, so a missing step is never hidden. */
  const show = (el: HTMLElement | null, focus?: HTMLElement | null) => {
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollIntoView({ block: "center", behavior: prefersReduced() ? "auto" : "smooth" });
      focus?.focus({ preventScroll: true });
      el.classList.remove("is-flash");
      void el.offsetWidth;
      el.classList.add("is-flash");
    });
  };

  /** The footer button when something is missing: take the user to it. */
  const goTo = (step: Step) => {
    if (step === "months") {
      const i = Math.max(
        0,
        rows.findIndex((r) => !r.months.length),
      );
      setRows((rs) => rs.map((x, j) => (j === i ? { ...x, edit: true } : x)));
      show(heads.current.get(rows[i].m.memberId)?.closest<HTMLElement>(".bq-rec-row") ?? null);
    } else if (step === "method") show(methodRef.current);
    else if (step === "payer") show(payerRef.current?.parentElement ?? null, payerRef.current);
    else if (step === "amount") show(amountRef.current?.parentElement ?? null, amountRef.current);
    else show(creditRef.current);
  };

  const addRow = (m: MemberRow) => {
    focusNext.current = m.memberId;
    setRows((rs) => [...rs, { m, months: defaultMonths(ctx, m), edit: false }]);
    setAdding(false);
  };

  const onShot = async (f: File) => {
    setErr("");
    setChecks(null);
    setRead(null);
    const seq = ++readSeq.current;
    // read the original first (sharper), then compress for the upload
    setReading(true);
    readReceipt(f, {
      expectedMro: total || undefined,
      accounts: accounts.map((a) => ({
        method: a.method,
        accountNumber: a.accountNumber,
        holderName: a.holderName,
      })),
    })
      .then((r) => {
        if (seq !== readSeq.current) return; // a newer picture replaced this one
        const got = new Set<ShotField>();
        if (r.method) {
          setMeth(r.method);
          got.add("method");
        }
        if (r.txnRef) {
          setTxn(r.txnRef);
          got.add("txn");
        }
        if (r.amountMro) {
          setSentTxt(String(r.amountMro));
          got.add("amount");
        }
        if (r.date && /^\d{4}-\d{2}-\d{2}/.test(r.date) && r.date.slice(0, 10) <= todayIso()) {
          setPaidOn(r.date.slice(0, 10));
          got.add("date");
        }
        setFromShot(got);
        setChecks(r.checks);
        setRead({ ok: got.size > 0 });
      })
      .catch(() => seq === readSeq.current && setRead({ ok: false }))
      .finally(() => seq === readSeq.current && setReading(false));
    try {
      const url = await compressImage(f);
      if (seq === readSeq.current) setShot({ url, name: f.name });
    } catch {
      if (seq === readSeq.current) setErr(imageOpenError(f));
    }
  };

  const submit = async () => {
    if (block || !meth) return;
    setBusy(true);
    setErr("");
    let proof: { path: string; hash: string } | undefined;
    let r: Awaited<ReturnType<typeof recordPayment>>;
    try {
      // the same id on every retry: the server replays instead of recording twice
      r = await sendOnce(once, async (id) => {
        if (shot) {
          const fd = new FormData();
          fd.set("file", dataUrlToBlob(shot.url), "proof.jpg");
          fd.set("kind", "payments");
          fd.set("id", id);
          const up = await uploadProof(fd);
          if (!up.ok) return up;
          proof = up.data;
        }
        rememberMembers(rows.map((r) => r.m));
        return recordPayment(
          toRecordInput(
            { ...draft, method: meth },
            {
              id,
              paidOn,
              txnRef: txn.trim() || undefined,
              proofPath: proof?.path,
              proofHash: proof?.hash,
            },
          ),
        );
      });
    } catch {
      r = failure("network");
    } finally {
      setBusy(false);
    }
    if (!r.ok) {
      setErr(r.message);
      return;
    }
    rememberRecent(rows.map((r) => r.m.memberId));
    router.refresh();
    const who =
      rows.length > 1
        ? `${rows[0].m.fullName} و${rows.length - 1 === 1 ? "عضو آخر" : `${rows.length - 1} آخرين`}`
        : rows[0].m.fullName;
    if (r.data.status === "confirmed") {
      // recorded by someone who may confirm: confirmed at once — show the stamp and the receipt
      setConfirmed({
        text: `سُجّلت دفعة ${who} وأُكّدت.`,
        r: {
          no: null,
          code: r.data.receiptCode,
          payer: payerName,
          covers: rows
            .filter((x) => x.months.length)
            .map((x) => ({ name: x.m.fullName, year: ctx.year, months: x.months })),
          campaigns:
            camp && campAmt > 0 ? [openCamps.find((c) => c.campaignId === camp)?.title ?? ""] : [],
          amount: total + credit,
          method: meth,
          txn: txn.trim() || null,
          txnLast4: txn.trim() ? txn.trim().slice(-4) : null,
          paidOn,
          recordedBy: me?.by ?? null,
          recordedAt: new Date().toISOString(),
          proofPath: proof?.path ?? null,
          status: {
            kind: "confirmed",
            by: me?.by ?? "",
            role: me?.role ?? "",
            at: new Date().toISOString(),
          },
        },
      });
      return;
    }
    onDone(`سُجّلت دفعة ${who}. تنتظر التأكيد.`);
  };

  if (confirmed)
    return (
      <div className="bq-rec bq-rec-done">
        <Stamp
          variant="confirmed"
          date={confirmed.r.status.kind === "confirmed" ? confirmed.r.status.at : paidOn}
          size={112}
          press
        />
        <h2>سُجّلت وأُكّدت</h2>
        <p className="bq-lead">{confirmed.text}</p>
        <ShareBtns r={confirmed.r} />
        <button
          type="button"
          className="bq-btn bq-btn-ghost bq-btn-lg bq-press"
          onClick={() => onDone(confirmed.text)}
        >
          تم
        </button>
      </div>
    );

  const feeMonths = rows.reduce((s, r) => s + r.months.length, 0);
  const payingRows = rows.filter((r) => r.months.length);
  const creditName = rows.find((r) => r.m.memberId === creditTo)?.m.fullName ?? "";
  const summary = [
    feeMonths > 0 &&
      (payingRows.length === 1
        ? `رسوم ${monthsLabel(payingRows[0].months)}`
        : `رسوم ${monthCount(feeMonths)} ${forMembers(payingRows.length)}`),
    campAmt > 0 && (
      <>
        مساهمة <Num>{fmt(campAmt)}</Num>
      </>
    ),
    credit > 0 && (
      <>
        رصيد <Num>{fmt(credit)}</Num> لـ {creditName}
      </>
    ),
    meth && METHOD_LABELS[meth],
    paidOn === todayIso() ? "اليوم" : dayWords(paidOn),
  ].filter(Boolean);
  const moreSub = [
    payer !== null && payerName !== rows[0]?.m.fullName ? `الدافع: ${payerName}` : "الدافع",
    txn.trim() ? "رقم العملية" : null,
    "المبلغ المحوّل",
    openCamps.length ? "حملة" : null,
  ]
    .filter(Boolean)
    .join("، ");
  const methods = [
    ...MAIN_METHODS,
    ...(moreMeth || (meth && !MAIN_METHODS.includes(meth)) ? OTHER_METHODS : []),
  ];

  return (
    <div className="bq-rec">
      <h2>سجّل دفعة</h2>

      <p className="bq-rec-k">{rows.length > 1 ? "الأعضاء في هذا التحويل" : "عن من هذه الدفعة؟"}</p>
      {rows.map((row, i) => (
        <RowCard
          key={row.m.memberId}
          row={row}
          ctx={ctx}
          price={priceOf(row.m)}
          headRef={(el) => {
            if (el) heads.current.set(row.m.memberId, el);
            else heads.current.delete(row.m.memberId);
          }}
          onChange={(r) => setRows((rs) => rs.map((x, j) => (j === i ? r : x)))}
          onRemove={() => {
            setRows((rs) => rs.filter((_, j) => j !== i));
            if (creditFor === row.m.memberId) setCreditFor(null);
            if (rows.length === 1) setAdding(true);
          }}
        />
      ))}
      {adding || !rows.length ? (
        <div className={rows.length ? "bq-rec-in" : undefined}>
          {rows.length > 0 && <p className="bq-rec-k">عضو آخر في نفس التحويل</p>}
          <MemberPicker
            members={members}
            exclude={exclude}
            onPick={addRow}
            autoFocus={rows.length > 0}
          />
          {rows.length > 0 && (
            <button
              type="button"
              className="bq-link bq-link-s bq-press"
              onClick={() => setAdding(false)}
            >
              إلغاء
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          className="bq-link bq-link-s bq-press bq-rec-add"
          onClick={() => setAdding(true)}
        >
          {I.plus(18)} عضو آخر في نفس التحويل
        </button>
      )}

      {rows.length > 0 && !adding && (
        <div className="bq-rec-in">
          <label className={`bq-rec-shot bq-press ${shot ? "has-shot" : ""}`}>
            {shot ? (
              // eslint-disable-next-line @next/next/no-img-element -- local data URL preview
              <img src={shot.url} alt="" className="bq-rec-thumb" />
            ) : (
              <span className="bq-rec-shot-i">{I.image(24)}</span>
            )}
            <span className="bq-rec-shot-t">
              <span className="bq-rec-shot-h">
                {shot ? "صورة التحويل مرفقة" : "أرفق صورة التحويل"}
              </span>
              <span className="bq-rec-shot-s" role="status">
                {reading ? (
                  <>
                    <span className="bq-spin" aria-hidden="true" /> نقرأ الصورة… يمكنك المتابعة.
                  </>
                ) : read ? (
                  read.ok ? (
                    "ملأنا ما قرأناه منها. راجعه قبل الحفظ."
                  ) : (
                    "لم نستطع قراءتها. أكمل الحقول بنفسك."
                  )
                ) : shot ? (
                  "اضغط لتغييرها."
                ) : (
                  "اختياري. نقرأ منها الوسيلة والمبلغ والتاريخ."
                )}
              </span>
            </span>
            {shot && <span className="bq-rec-shot-a">تغيير</span>}
            <input
              type="file"
              accept="image/*"
              className="bq-sr"
              aria-label={shot ? "تغيير صورة التحويل" : "أرفق صورة التحويل"}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void onShot(f);
              }}
            />
          </label>
          {checks && !checks.recipient && (
            <p className="bq-hint">{I.search(16)} تحقق: المستلم في الصورة ليس من أرقام الصندوق.</p>
          )}

          <div className="bq-rec-sec" ref={methodRef}>
            <p className="bq-rec-k" id="bq-rec-meth">
              كيف دفع؟ <Mark from={fromShot.has("method")} ok={!!checks?.method} />
            </p>
            <div className="bq-meth-grid" role="radiogroup" aria-labelledby="bq-rec-meth">
              {methods.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={meth === m}
                  className="bq-meth-opt bq-press is-main"
                  onClick={() => {
                    setMeth(m);
                    touched("method");
                  }}
                >
                  <MethodBadge method={m} size={36} label={false} />
                  <span>{METHOD_LABELS[m]}</span>
                </button>
              ))}
            </div>
            {!moreMeth && !(meth && !MAIN_METHODS.includes(meth)) && (
              <button
                type="button"
                className="bq-link bq-link-s bq-press"
                onClick={() => setMoreMeth(true)}
              >
                محفظة أخرى
              </button>
            )}
          </div>

          <p className="bq-rec-k">
            تاريخ الدفع <Mark from={fromShot.has("date")} ok={!!checks?.date} />
          </p>
          <DateField
            value={paidOn}
            onChange={(v) => {
              setPaidOn(v);
              touched("date");
            }}
            label="تاريخ الدفع"
            noFuture
          />

          <div className="bq-rec-more" ref={moreRef}>
            <button
              type="button"
              className="bq-rec-more-h bq-press"
              aria-expanded={more}
              aria-controls="bq-rec-more-b"
              onClick={() => setMore(!more)}
            >
              <span className="bq-row-m">
                <span className="bq-row-t">تفاصيل أخرى</span>
                <span className="bq-row-s">{moreSub}</span>
              </span>
              <span className="bq-rec-more-i">{I.chev(20)}</span>
            </button>
            {more && (
              <div id="bq-rec-more-b" className="bq-rec-in">
                <label className="bq-rec-field">
                  <span className="bq-rec-k">
                    المبلغ المحوّل (أوقية قديمة){" "}
                    <Mark from={fromShot.has("amount")} ok={diff === 0} />
                  </span>
                  <input
                    ref={amountRef}
                    className="bq-input"
                    value={sentTxt}
                    onChange={(e) => {
                      setSentTxt(toWesternDigits(e.target.value));
                      touched("amount");
                    }}
                    inputMode="numeric"
                    dir="ltr"
                    placeholder={total ? fmt(total) : ""}
                    aria-describedby="bq-rec-sent-h"
                  />
                  <span className="bq-hint" id="bq-rec-sent-h">
                    {sent === null ? (
                      "اتركه فارغًا إذا حُوّل المجموع نفسه."
                    ) : diff === 0 ? (
                      <>{I.check(16)} يطابق المجموع.</>
                    ) : sent > 0 && sent * 10 === total ? (
                      "يبدو أنك كتبت المبلغ بالأوقية الجديدة. اضربه في 10."
                    ) : diff < 0 ? (
                      <>
                        أقل من المجموع بـ <Num className="bq-strong">{fmt(-diff)}</Num> أوقية.
                      </>
                    ) : (
                      <>
                        أكبر من المجموع بـ <Num className="bq-strong">{fmt(diff)}</Num> أوقية.
                      </>
                    )}
                  </span>
                </label>
                {sent !== null && sent > 0 && sent * 10 === total && (
                  <button
                    type="button"
                    className="bq-chip bq-press bq-rec-fit"
                    onClick={() => {
                      setSentTxt(String(sent * 10));
                      touched("amount");
                    }}
                  >
                    اجعله <Num>{fmt(sent * 10)}</Num> أوقية قديمة
                  </button>
                )}
                {fitMonths && sent !== null && sent * 10 !== total && (
                  <button
                    type="button"
                    className="bq-chip bq-press bq-rec-fit"
                    onClick={() =>
                      setRows((rs) => [{ ...rs[0], months: rs[0].months.slice(0, fitMonths) }])
                    }
                  >
                    سجّل {monthCount(fitMonths)} فقط
                  </button>
                )}
                {diff > 0 && (
                  <div className="bq-rec-credit bq-rec-in" ref={creditRef}>
                    {rows.length === 1 ? (
                      <p className="bq-hint">
                        الباقي <Num className="bq-strong">{fmt(diff)}</Num> أوقية يُحفظ رصيدًا لـ{" "}
                        {rows[0].m.fullName}.
                      </p>
                    ) : (
                      <>
                        <p className="bq-hint" id="bq-rec-credit">
                          الباقي <Num className="bq-strong">{fmt(diff)}</Num> أوقية. يُحفظ رصيدًا
                          لـ:
                        </p>
                        <div className="bq-chips" role="radiogroup" aria-labelledby="bq-rec-credit">
                          {rows.map((r) => (
                            <button
                              key={r.m.memberId}
                              type="button"
                              role="radio"
                              aria-checked={creditTo === r.m.memberId}
                              className="bq-chip bq-press"
                              onClick={() => setCreditFor(r.m.memberId)}
                            >
                              {r.m.fullName}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {meth !== "cash" && (
                  <label className="bq-rec-field">
                    <span className="bq-rec-k">
                      رقم العملية (اختياري){" "}
                      <Mark from={fromShot.has("txn")} ok={!!checks?.txnRef} />
                    </span>
                    <input
                      className="bq-input"
                      value={txn}
                      onChange={(e) => {
                        setTxn(toWesternDigits(e.target.value));
                        touched("txn");
                      }}
                      dir="ltr"
                    />
                  </label>
                )}

                <label className="bq-rec-field">
                  <span className="bq-rec-k">الدافع (صاحب التحويل)</span>
                  <input
                    ref={payerRef}
                    className="bq-input"
                    value={payer ?? rows[0].m.fullName}
                    onChange={(e) => setPayer(e.target.value)}
                  />
                </label>

                {openCamps.length > 0 && (
                  <>
                    <p className="bq-rec-k" id="bq-rec-camp">
                      ومعها مساهمة في حملة؟
                    </p>
                    <div className="bq-chips" role="radiogroup" aria-labelledby="bq-rec-camp">
                      {openCamps.map((c) => (
                        <button
                          key={c.campaignId}
                          type="button"
                          role="radio"
                          aria-checked={camp === c.campaignId}
                          className="bq-chip bq-press"
                          onClick={() => setCamp(camp === c.campaignId ? null : c.campaignId)}
                        >
                          {c.title}
                        </button>
                      ))}
                    </div>
                    {camp && (
                      <input
                        className="bq-input bq-rec-in bq-rec-camp-amt"
                        value={campTxt}
                        onChange={(e) => setCampTxt(toWesternDigits(e.target.value))}
                        inputMode="numeric"
                        dir="ltr"
                        placeholder="مبلغ المساهمة بالأوقية"
                        aria-label="مبلغ المساهمة"
                      />
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {rows.length > 0 && !adding && (
        <div className="bq-rec-foot">
          <div className="bq-rec-sum" aria-live="polite">
            <p className="bq-rec-sum-l">
              <span className="bq-hint">سيُسجَّل</span>
              <span>
                <Num className="bq-rec-amt">{fmt(total + credit)}</Num> أوقية
              </span>
            </p>
            {summary.length > 0 && (
              <p className="bq-rec-what">
                {summary.map((s, i) => (
                  <span key={i}>{s}</span>
                ))}
              </p>
            )}
          </div>
          {err ? (
            <p className="bq-alert" role="alert">
              {err}
            </p>
          ) : (
            // the button already names the step; say more only when the numbers disagree
            block &&
            (!block.step || block.step === "amount" || block.step === "credit") && (
              <p className={diff < 0 && !fitMonths ? "bq-alert" : "bq-hint"}>{block.msg}</p>
            )
          )}
          <button
            type="button"
            className={`bq-btn bq-btn-lg bq-press ${block?.step ? "bq-btn-soft" : "bq-btn-primary"}`}
            disabled={busy || !online || (!!block && !block.step)}
            onClick={() => (block?.step ? goTo(block.step) : void submit())}
          >
            {busy ? "جارٍ الحفظ…" : block?.step ? STEP_CTA[block.step] : "سجّل الدفعة"}
          </button>
          <OfflineWriteHint />
        </div>
      )}
    </div>
  );
}
