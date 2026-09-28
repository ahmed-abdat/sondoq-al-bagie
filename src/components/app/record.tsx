"use client";
// «سجّل دفعة»: who → which months → how → (ref, screenshot) → total → record.
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { OfflineWriteHint, useOnline } from "@/components/providers";
import { compressImage, dataUrlToBlob } from "@/lib/compress-image";
import { recordPayment, uploadProof } from "@/lib/data/actions";
import type { FundAccount, MemberStatus, PaymentMethod } from "@/lib/data/types";
import { readReceipt, terminateOcr, warmOcr, type ReceiptChecks } from "@/lib/ocr";
import { MAIN_METHODS, METHOD_LABELS, METHODS } from "@/lib/methods";
import { todayIso } from "@/lib/dates";
import { Avatar, MethodBadge, StatusTag } from "./bits";
import { fmt, groupLabel, MONTHS, monthsWord, searchMembers, memberCode } from "./derive";
import { I } from "./icons";
import type { MemberCtx } from "./member";
import { Num } from "./num";

const ORDER: PaymentMethod[] = [
  ...MAIN_METHODS,
  ...METHODS.filter((m) => !MAIN_METHODS.includes(m) && m !== "paper"),
];

/** «تحقق»: the reading could not confirm this field; it stays editable. */
const Check = ({ bad }: { bad: boolean | undefined }) =>
  bad ? <span className="bq-tag is-late bq-tag-inline">{I.search(16)} تحقق</span> : null;

export function RecordBody({
  members,
  ctx,
  accounts,
  onDone,
}: {
  members: MemberStatus[];
  ctx: MemberCtx;
  /** the fund's wallets: the receipt reading checks the money went to one of them */
  accounts: FundAccount[];
  onDone: (text: string) => void;
}) {
  const router = useRouter();
  const online = useOnline();
  const [q, setQ] = useState("");
  const [who, setWho] = useState<MemberStatus | null>(null);
  const [months, setMonths] = useState<number[]>([]);
  const [meth, setMeth] = useState<PaymentMethod | null>(null);
  const [txn, setTxn] = useState("");
  const [shot, setShot] = useState<{ url: string; name: string } | null>(null);
  const [paidOn, setPaidOn] = useState(todayIso());
  const [reading, setReading] = useState(false);
  const [checks, setChecks] = useState<(ReceiptChecks & { readMro: number | null }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    void warmOcr();
    return () => void terminateOcr();
  }, []);
  const res = useMemo(() => searchMembers(members, q).slice(0, 4), [members, q]);
  const paid = useMemo(
    () =>
      new Set(
        who
          ? ctx.months
              .filter((m) => m.memberId === who.memberId && m.state === "paid")
              .map((m) => m.month)
          : [],
      ),
    [who, ctx.months],
  );
  const openM = MONTHS.map((_, k) => k + 1).filter((k) => !paid.has(k));
  const owed = openM.filter((k) => k <= ctx.dueMonth);
  const price = who ? (ctx.prices[who.groupCode] ?? 0) : 0;
  const quick = who
    ? [
        { k: "year", l: "السنة كاملة", ms: openM },
        { k: "late", l: `الأشهر المتأخرة${owed.length ? ` (${owed.length})` : ""}`, ms: owed },
        { k: "one", l: "شهر واحد", ms: openM.slice(0, 1) },
      ]
    : [];
  const same = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);
  const amount = months.length * price;

  const pickWho = (m: MemberStatus) => {
    setWho(m);
    setQ("");
    const p = new Set(
      ctx.months.filter((x) => x.memberId === m.memberId && x.state === "paid").map((x) => x.month),
    );
    setMonths(MONTHS.map((_, k) => k + 1).filter((k) => !p.has(k))); // most pay the year up front
  };

  const submit = async () => {
    if (!who || !meth || !months.length || !price) return;
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
    const r = await recordPayment({
      id,
      payerName: who.fullName,
      method: meth,
      amount,
      paidOn,
      allocations: months.map((month) => ({
        kind: "months" as const,
        memberId: who.memberId,
        year: ctx.year,
        month,
        amount: price,
      })),
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
    onDone(
      r.data.status === "confirmed"
        ? `سُجّلت دفعة ${who.fullName} وأُكّدت.`
        : `سُجّلت دفعة ${who.fullName}. تنتظر تأكيد أمين الصندوق.`,
    );
  };

  return (
    <div className="bq-rec">
      <h2>سجّل دفعة</h2>
      <p className="bq-rec-k">العضو</p>
      {who ? (
        <div className="bq-rec-who">
          <Avatar code={memberCode(who)} />
          <span className="bq-row-m">
            <span className="bq-row-t">{who.fullName}</span>
            <span className="bq-row-s">
              الفئة {groupLabel(who.groupCode)} · الرسوم الشهرية <Num>{fmt(price)}</Num>
            </span>
          </span>
          <button type="button" className="bq-link bq-link-s bq-press" onClick={() => setWho(null)}>
            تغيير
          </button>
        </div>
      ) : (
        <>
          <label className="bq-search bq-search-s">
            {I.search(22)}
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="رقم العضو أو اسمه"
              aria-label="ابحث عن العضو"
              type="search"
            />
          </label>
          <ul className="bq-list">
            {res.map((m) => (
              <li key={m.memberId}>
                <button type="button" className="bq-row bq-press" onClick={() => pickWho(m)}>
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
      )}

      {who && (
        <>
          <p className="bq-rec-k">عن أي أشهر؟</p>
          <div className="bq-chips" role="group" aria-label="اختيار سريع">
            {quick.map((o) => (
              <button
                key={o.k}
                type="button"
                className="bq-chip bq-press"
                aria-pressed={o.ms.length > 0 && same(months, o.ms)}
                disabled={!o.ms.length}
                onClick={() => setMonths(o.ms)}
              >
                {o.l}
              </button>
            ))}
          </div>
          <ol className="bq-mstrip" aria-label="الأشهر">
            {MONTHS.map((name, i) => {
              const k = i + 1;
              const isPaid = paid.has(k);
              const on = months.includes(k);
              return (
                <li key={k}>
                  <button
                    type="button"
                    className={`bq-mpick bq-press ${isPaid ? "is-paid" : ""}`}
                    aria-pressed={on}
                    disabled={isPaid}
                    onClick={() =>
                      setMonths((ms) =>
                        on ? ms.filter((x) => x !== k) : [...ms, k].sort((a, b) => a - b),
                      )
                    }
                  >
                    {name}
                    {isPaid && <span className="bq-mpick-s">مدفوع</span>}
                  </button>
                </li>
              );
            })}
          </ol>

          <p className="bq-rec-k">صورة التحويل</p>
          <label className="bq-btn bq-btn-soft bq-press">
            {I.image(20)} {shot ? "تغيير الصورة" : "اختر صورة التحويل"}
            <input
              type="file"
              accept="image/*"
              className="bq-sr"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setErr("");
                setChecks(null);
                // read the original first (sharper), then compress for the upload
                setReading(true);
                readReceipt(f, {
                  expectedMro: amount || undefined,
                  accounts: accounts.map((a) => ({
                    method: a.method,
                    accountNumber: a.accountNumber,
                    holderName: a.holderName,
                  })),
                })
                  .then((r) => {
                    if (r.method) setMeth(r.method);
                    if (r.txnRef) setTxn(r.txnRef);
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
              }}
            />
          </label>
          {reading && (
            <p className="bq-hint" role="status">
              نقرأ الصورة… قد يأخذ ذلك بضع ثوانٍ. يمكنك إكمال الحقول بنفسك.
            </p>
          )}
          {shot && !reading && <p className="bq-hint">أُرفقت: {shot.name}</p>}
          {checks && !checks.recipient && (
            <p className="bq-hint">{I.search(16)} تحقق: المستلم في الصورة ليس من أرقام الصندوق.</p>
          )}
          {checks && !checks.amount && (
            <p className="bq-hint">
              {I.search(16)} تحقق من المبلغ
              {checks.readMro ? (
                <>
                  : في الصورة <Num>{fmt(checks.readMro)}</Num> أوقية
                </>
              ) : null}
              .
            </p>
          )}

          <p className="bq-rec-k">كيف دفع؟</p>
          <Check bad={checks ? !checks.method : false} />
          <div className="bq-meth-grid" role="radiogroup" aria-label="وسيلة الدفع">
            {ORDER.map((m, i) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={meth === m}
                className={`bq-meth-opt bq-press ${i < MAIN_METHODS.length ? "is-main" : ""}`}
                onClick={() => setMeth(m)}
              >
                <MethodBadge method={m} size={36} label={false} />
                <span>{METHOD_LABELS[m]}</span>
              </button>
            ))}
          </div>

          {meth !== "cash" && (
            <>
              <p className="bq-rec-k">رقم العملية</p>
              <input
                className="bq-input"
                value={txn}
                onChange={(e) => setTxn(e.target.value)}
                dir="ltr"
                aria-label="رقم العملية"
              />
              <Check bad={checks ? !checks.txnRef : false} />
            </>
          )}
          <p className="bq-rec-k">تاريخ الدفع</p>
          <input
            className="bq-input"
            type="date"
            dir="ltr"
            value={paidOn}
            max={todayIso()}
            onChange={(e) => setPaidOn(e.target.value)}
            aria-label="تاريخ الدفع"
          />
          <Check bad={checks ? !checks.date : false} />
          <div className="bq-rec-foot">
            <p className="bq-rec-sum" aria-live="polite">
              <span className="bq-hint">
                {months.length ? (
                  <>
                    {monthsWord(months.length)} × <Num>{fmt(price)}</Num>
                  </>
                ) : (
                  "اختر شهرًا واحدًا على الأقل"
                )}
              </span>
              <span>
                <Num className="bq-rec-amt">{fmt(amount)}</Num> أوقية
              </span>
            </p>
            {err && (
              <p className="bq-alert" role="alert">
                {err}
              </p>
            )}
            <button
              type="button"
              className="bq-btn bq-btn-primary bq-btn-lg bq-press"
              disabled={!months.length || !meth || !price || busy || !online}
              onClick={() => void submit()}
            >
              {busy ? "جارٍ الحفظ…" : "سجّل الدفعة"}
            </button>
            <OfflineWriteHint />
          </div>
        </>
      )}
    </div>
  );
}
