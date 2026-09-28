"use client";
// «سجّل دفعة»: one transfer, for one member or several (a father for his sons, brothers…).
// Who → months (smart default) → how → total. Screenshot, ref, date, campaign and a different
// payer are optional and tucked away. The total is the sum of the rows; a bigger transfer can
// keep the rest as credit for one of them; a smaller one blocks with a clear message.
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { OfflineWriteHint, useOnline } from "@/components/providers";
import { compressImage, dataUrlToBlob } from "@/lib/compress-image";
import type { CampaignProgress, FundAccount, MemberStatus, PaymentMethod } from "@/lib/data/types";
import { todayIso } from "@/lib/dates";
import { MAIN_METHODS, METHOD_LABELS, METHODS } from "@/lib/methods";
import { parseAmount, toWesternDigits } from "@/lib/money";
import { readReceipt, terminateOcr, warmOcr, type ReceiptChecks } from "@/lib/ocr";
import { rememberMembers, useAct } from "./act";
import { ShareBtns } from "./entries";
import { Stamp } from "./receipt";
import type { ReceiptView } from "./receipt-model";
import { Avatar, MethodBadge, StatusTag } from "./bits";
import {
  dayWords,
  fmt,
  groupLabel,
  memberCode,
  MONTHS,
  monthsLabel,
  monthCount,
  searchMembers,
} from "./derive";
import { I } from "./icons";
import type { MemberCtx } from "./member";
import { Num } from "./num";

const OTHER_METHODS: PaymentMethod[] = METHODS.filter(
  (m) => !MAIN_METHODS.includes(m) && m !== "paper",
);

/** «تحقق»: the reading could not confirm this field; it stays editable. */
const Check = ({ bad }: { bad: boolean | undefined }) =>
  bad ? <span className="bq-tag is-late bq-tag-inline">{I.search(16)} تحقق</span> : null;

type Row = { m: MemberStatus; months: number[]; edit: boolean };

function paidSet(ctx: MemberCtx, memberId: string) {
  return new Set(
    ctx.months.filter((x) => x.memberId === memberId && x.state === "paid").map((x) => x.month),
  );
}

/** Default months: the unpaid ones that are due (late); if none, the whole rest of the year. */
function defaultMonths(ctx: MemberCtx, memberId: string) {
  const paid = paidSet(ctx, memberId);
  const open = MONTHS.map((_, k) => k + 1).filter((k) => !paid.has(k));
  const late = open.filter((k) => k <= ctx.dueMonth);
  return late.length ? late : open;
}

function MemberPicker({
  members,
  exclude,
  onPick,
  autoFocus,
}: {
  members: MemberStatus[];
  exclude: Set<string>;
  onPick: (m: MemberStatus) => void;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState("");
  const res = useMemo(
    () =>
      searchMembers(
        members.filter((m) => m.status === "active" && !exclude.has(m.memberId)),
        q,
      ).slice(0, 4),
    [members, exclude, q],
  );
  return (
    <>
      <label className="bq-search bq-search-s">
        {I.search(22)}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="اسم العضو أو رقمه، مثل B-12"
          aria-label="ابحث عن العضو"
          type="search"
          autoFocus={autoFocus}
        />
      </label>
      {q.trim() && !res.length && <p className="bq-hint">لم نجد عضوًا بهذا الاسم أو الرقم.</p>}
      <ul className="bq-list">
        {res.map((m) => (
          <li key={m.memberId}>
            <button type="button" className="bq-row bq-press" onClick={() => onPick(m)}>
              <Avatar code={memberCode(m)} />
              <span className="bq-row-m">
                <span className="bq-row-t">{m.fullName}</span>
                <span className="bq-row-s">الفئة {groupLabel(m.groupCode)}</span>
              </span>
              <StatusTag m={m} />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function RowCard({
  row,
  ctx,
  price,
  onChange,
  onRemove,
}: {
  row: Row;
  ctx: MemberCtx;
  price: number;
  onChange: (r: Row) => void;
  onRemove?: () => void;
}) {
  const paid = paidSet(ctx, row.m.memberId);
  const open = MONTHS.map((_, k) => k + 1).filter((k) => !paid.has(k));
  const late = open.filter((k) => k <= ctx.dueMonth);
  const same = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);
  const quick = [
    { k: "late", l: `المتأخرة${late.length ? ` (${late.length})` : ""}`, ms: late },
    { k: "year", l: "كل ما بقي من السنة", ms: open },
    { k: "one", l: "شهر واحد", ms: open.slice(0, 1) },
  ];
  return (
    <div className="bq-rec-row">
      <div className="bq-rec-who">
        <Avatar code={memberCode(row.m)} />
        <span className="bq-row-m">
          <span className="bq-row-t">{row.m.fullName}</span>
          <span className="bq-row-s">
            {row.months.length ? (
              <>
                رسوم {monthsLabel(row.months)} · {monthCount(row.months.length)} ×{" "}
                <Num>{fmt(price)}</Num>
              </>
            ) : open.length ? (
              "لم تُختر أشهر"
            ) : (
              "دفع رسوم هذا العام كاملة"
            )}
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
      {!row.edit ? (
        <button
          type="button"
          className="bq-link bq-link-s bq-press"
          onClick={() => onChange({ ...row, edit: true })}
        >
          تغيير الأشهر
        </button>
      ) : (
        <>
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
              const isPaid = paid.has(k);
              const on = row.months.includes(k);
              return (
                <li key={k}>
                  <button
                    type="button"
                    className={`bq-mpick bq-press ${isPaid ? "is-paid" : ""}`}
                    aria-pressed={on}
                    disabled={isPaid}
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
                  </button>
                </li>
              );
            })}
          </ol>
          <button
            type="button"
            className="bq-link bq-link-s bq-press"
            onClick={() => onChange({ ...row, edit: false })}
          >
            تم
          </button>
        </>
      )}
    </div>
  );
}

export function RecordBody({
  members,
  ctx,
  accounts,
  campaigns = [],
  me,
  onDone,
}: {
  members: MemberStatus[];
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
  const [rows, setRows] = useState<Row[]>([]);
  const [adding, setAdding] = useState(true);
  const [payer, setPayer] = useState<string | null>(null); // null = the first member
  const [editPayer, setEditPayer] = useState(false);
  const [meth, setMeth] = useState<PaymentMethod | null>(null);
  const [moreMeth, setMoreMeth] = useState(false);
  const [txn, setTxn] = useState("");
  const [sentTxt, setSentTxt] = useState("");
  const [creditFor, setCreditFor] = useState<string | null>(null);
  const [shot, setShot] = useState<{ url: string; name: string } | null>(null);
  const [paidOn, setPaidOn] = useState(todayIso());
  const [editDate, setEditDate] = useState(false);
  const [camp, setCamp] = useState<string | null>(null);
  const [campOpen, setCampOpen] = useState(false);
  const [campTxt, setCampTxt] = useState("");
  const [reading, setReading] = useState(false);
  const [checks, setChecks] = useState<(ReceiptChecks & { readMro: number | null }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirmed, setConfirmed] = useState<{ r: ReceiptView; text: string } | null>(null);
  useEffect(() => {
    void warmOcr();
    return () => void terminateOcr();
  }, []);

  const priceOf = (m: MemberStatus) => ctx.prices[m.groupCode] ?? 0;
  const feeTotal = rows.reduce((s, r) => s + r.months.length * priceOf(r.m), 0);
  const campAmt = camp ? Math.max(0, Math.round(parseAmount(campTxt) ?? 0)) : 0;
  const total = feeTotal + campAmt;
  const sent = sentTxt.trim() ? Math.round(parseAmount(sentTxt) ?? 0) : null;
  const diff = sent === null ? 0 : sent - total;
  const openCamps = campaigns.filter((c) => c.status === "open");
  const payerName = (payer ?? rows[0]?.m.fullName ?? "").trim();
  const exclude = useMemo(() => new Set(rows.map((r) => r.m.memberId)), [rows]);
  const missingPrice = rows.some((r) => r.months.length > 0 && !priceOf(r.m));

  const block = !rows.length
    ? "اختر العضو أولًا."
    : total <= 0
      ? "اختر شهرًا واحدًا على الأقل أو أضف مساهمة."
      : missingPrice
        ? "لا نعرف الرسوم الشهرية لفئة هذا العضو. راجع المسؤول."
        : !meth
          ? "بقي أن تختار كيف دفع."
          : !payerName
            ? "اكتب اسم الدافع."
            : diff < 0
              ? `المبلغ المحوّل أقل من المجموع بـ ${fmt(-diff)} أوقية. أنقِص الأشهر أو صحّح المبلغ.`
              : diff > 0 && !creditFor
                ? `المبلغ المحوّل أكبر من المجموع بـ ${fmt(diff)} أوقية. احفظ الباقي رصيدًا لأحدهم أو زِد الأشهر.`
                : "";

  const addRow = (m: MemberStatus) => {
    setRows((rs) => [...rs, { m, months: defaultMonths(ctx, m.memberId), edit: false }]);
    setAdding(false);
  };

  const onShot = async (f: File) => {
    setErr("");
    setChecks(null);
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
        if (r.method) setMeth(r.method);
        if (r.txnRef) setTxn(r.txnRef);
        if (r.amountMro) setSentTxt(String(r.amountMro));
        if (r.date && /^\d{4}-\d{2}-\d{2}/.test(r.date)) setPaidOn(r.date.slice(0, 10));
        setChecks({ ...r.checks, readMro: r.amountMro });
      })
      .catch(() => setChecks(null))
      .finally(() => setReading(false));
    try {
      setShot({ url: await compressImage(f), name: f.name });
    } catch {
      setErr("تعذّر قراءة الصورة. جرّب صورة أخرى.");
    }
  };

  const submit = async () => {
    if (block || !meth) return;
    setBusy(true);
    setErr("");
    const id = crypto.randomUUID();
    let proof: { path: string; hash: string } | undefined;
    if (shot) {
      const fd = new FormData();
      fd.set("file", dataUrlToBlob(shot.url), "proof.jpg");
      fd.set("kind", "payments");
      fd.set("id", id);
      const up = await uploadProof(fd);
      if (!up.ok) {
        setErr(up.message);
        setBusy(false);
        return;
      }
      proof = up.data;
    }
    const credit = diff > 0 && creditFor ? diff : 0;
    rememberMembers(rows.map((r) => r.m));
    const r = await recordPayment({
      id,
      payerName,
      method: meth,
      amount: total + credit,
      paidOn,
      allocations: [
        ...rows.flatMap((row) =>
          row.months.map((month) => ({
            kind: "months" as const,
            memberId: row.m.memberId,
            year: ctx.year,
            month,
            amount: priceOf(row.m),
          })),
        ),
        ...(camp && campAmt > 0
          ? [
              {
                kind: "campaign" as const,
                campaignId: camp,
                memberId: rows[0].m.memberId,
                amount: campAmt,
              },
            ]
          : []),
        ...(credit && creditFor
          ? [{ kind: "credit" as const, memberId: creditFor, amount: credit }]
          : []),
      ],
      txnRef: txn.trim() || undefined,
      proofPath: proof?.path,
      proofHash: proof?.hash,
    });
    setBusy(false);
    if (!r.ok) {
      setErr(r.message);
      return;
    }
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
          onChange={(r) => setRows((rs) => rs.map((x, j) => (j === i ? r : x)))}
          onRemove={() => {
            setRows((rs) => rs.filter((_, j) => j !== i));
            if (creditFor === row.m.memberId) setCreditFor(null);
            if (rows.length === 1) setAdding(true);
          }}
        />
      ))}
      {adding || !rows.length ? (
        <>
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
        </>
      ) : (
        <button
          type="button"
          className="bq-btn bq-btn-soft bq-press bq-rec-add"
          onClick={() => setAdding(true)}
        >
          {I.plus(20)} إضافة عضو آخر لنفس التحويل
        </button>
      )}

      {rows.length > 0 && (
        <>
          <p className="bq-rec-k">الدافع</p>
          {editPayer ? (
            <input
              className="bq-input"
              value={payer ?? rows[0].m.fullName}
              onChange={(e) => setPayer(e.target.value)}
              aria-label="اسم الدافع"
              autoFocus
            />
          ) : (
            <p className="bq-rec-line">
              <span>{payerName}</span>
              <button
                type="button"
                className="bq-link bq-link-s bq-press"
                onClick={() => setEditPayer(true)}
              >
                دفع شخص آخر؟
              </button>
            </p>
          )}

          {openCamps.length > 0 &&
            (campOpen ? (
              <>
                <p className="bq-rec-k">مساهمة في حملة</p>
                <div className="bq-chips" role="radiogroup" aria-label="الحملة">
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
                    className="bq-input"
                    value={campTxt}
                    onChange={(e) => setCampTxt(toWesternDigits(e.target.value))}
                    inputMode="numeric"
                    dir="ltr"
                    placeholder="مبلغ المساهمة بالأوقية"
                    aria-label="مبلغ المساهمة"
                  />
                )}
              </>
            ) : (
              <button
                type="button"
                className="bq-link bq-link-s bq-press"
                onClick={() => setCampOpen(true)}
              >
                {I.plus(18)} ومعها مساهمة في حملة
              </button>
            ))}

          <p className="bq-rec-k">صورة التحويل (تملأ الحقول وحدها)</p>
          <label className="bq-btn bq-btn-soft bq-press">
            {I.image(20)} {shot ? "تغيير الصورة" : "اختر صورة التحويل"}
            <input
              type="file"
              accept="image/*"
              className="bq-sr"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onShot(f);
              }}
            />
          </label>
          {reading && (
            <p className="bq-hint" role="status">
              <span className="bq-spin" aria-hidden="true" /> نقرأ الصورة… يمكنك إكمال الحقول بنفسك.
            </p>
          )}
          {shot && !reading && <p className="bq-hint">أُرفقت الصورة.</p>}
          {checks && !checks.recipient && (
            <p className="bq-hint">{I.search(16)} تحقق: المستلم في الصورة ليس من أرقام الصندوق.</p>
          )}

          <p className="bq-rec-k">
            كيف دفع؟ <Check bad={checks ? !checks.method : false} />
          </p>
          <div className="bq-meth-grid" role="radiogroup" aria-label="وسيلة الدفع">
            {[
              ...MAIN_METHODS,
              ...(moreMeth || (meth && !MAIN_METHODS.includes(meth)) ? OTHER_METHODS : []),
            ].map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={meth === m}
                className="bq-meth-opt bq-press is-main"
                onClick={() => setMeth(m)}
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

          {meth && meth !== "cash" && (
            <>
              <p className="bq-rec-k">
                رقم العملية (اختياري) <Check bad={checks ? !checks.txnRef : false} />
              </p>
              <input
                className="bq-input"
                value={txn}
                onChange={(e) => setTxn(toWesternDigits(e.target.value))}
                dir="ltr"
                aria-label="رقم العملية"
              />
            </>
          )}

          <p className="bq-rec-k">
            المبلغ المحوّل (اختياري) <Check bad={checks ? !checks.amount : false} />
          </p>
          <input
            className="bq-input"
            value={sentTxt}
            onChange={(e) => setSentTxt(toWesternDigits(e.target.value))}
            inputMode="numeric"
            dir="ltr"
            placeholder={total ? fmt(total) : ""}
            aria-label="المبلغ المحوّل بالأوقية"
          />
          {diff > 0 && (
            <div className="bq-rec-credit">
              <p className="bq-hint">
                الباقي <Num className="bq-strong">{fmt(diff)}</Num> أوقية. يُحفظ رصيدًا لـ:
              </p>
              <div className="bq-chips" role="radiogroup" aria-label="رصيد الباقي">
                {rows.map((r) => (
                  <button
                    key={r.m.memberId}
                    type="button"
                    role="radio"
                    aria-checked={creditFor === r.m.memberId}
                    className="bq-chip bq-press"
                    onClick={() => setCreditFor(r.m.memberId)}
                  >
                    {r.m.fullName}
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="bq-rec-k">
            تاريخ الدفع <Check bad={checks ? !checks.date : false} />
          </p>
          {editDate ? (
            <input
              className="bq-input"
              type="date"
              dir="ltr"
              value={paidOn}
              max={todayIso()}
              onChange={(e) => setPaidOn(e.target.value)}
              aria-label="تاريخ الدفع"
            />
          ) : (
            <p className="bq-rec-line">
              <span>{paidOn === todayIso() ? "اليوم" : dayWords(paidOn)}</span>
              <button
                type="button"
                className="bq-link bq-link-s bq-press"
                onClick={() => setEditDate(true)}
              >
                تغيير التاريخ
              </button>
            </p>
          )}
        </>
      )}

      <div className="bq-rec-foot">
        <p className="bq-rec-sum" aria-live="polite">
          <span className="bq-hint">
            {rows.length > 1 ? `${rows.length} أعضاء` : "المجموع"}
            {campAmt > 0 && (
              <>
                {" "}
                + مساهمة <Num>{fmt(campAmt)}</Num>
              </>
            )}
          </span>
          <span>
            <Num className="bq-rec-amt">{fmt(total + (diff > 0 && creditFor ? diff : 0))}</Num>{" "}
            أوقية
          </span>
        </p>
        {err ? (
          <p className="bq-alert" role="alert">
            {err}
          </p>
        ) : (
          block && rows.length > 0 && <p className={diff < 0 ? "bq-alert" : "bq-hint"}>{block}</p>
        )}
        <button
          type="button"
          className="bq-btn bq-btn-primary bq-btn-lg bq-press"
          disabled={!!block || busy || !online}
          onClick={() => void submit()}
        >
          {busy ? "جارٍ الحفظ…" : "سجّل الدفعة"}
        </button>
        <OfflineWriteHint />
      </div>
    </div>
  );
}
