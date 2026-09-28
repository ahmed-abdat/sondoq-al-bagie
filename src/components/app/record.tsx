"use client";
// «سجّل دفعة»: who → which months → how → (ref, screenshot) → total → record.
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { OfflineWriteHint, useOnline } from "@/components/providers";
import { compressImage, dataUrlToBlob } from "@/lib/compress-image";
import { recordPayment, uploadProof } from "@/lib/data/actions";
import type { MemberStatus, PaymentMethod } from "@/lib/data/types";
import { MAIN_METHODS, METHOD_LABELS, METHODS } from "@/lib/methods";
import { todayIso } from "@/lib/dates";
import { Avatar, MethodBadge, StatusTag } from "./bits";
import { fmt, groupLabel, MONTHS, monthsWord, searchMembers } from "./derive";
import { I } from "./icons";
import type { MemberCtx } from "./member";
import { Num } from "./num";

const ORDER: PaymentMethod[] = [
  ...MAIN_METHODS,
  ...METHODS.filter((m) => !MAIN_METHODS.includes(m) && m !== "paper"),
];

export function RecordBody({
  members,
  ctx,
  onDone,
}: {
  members: MemberStatus[];
  ctx: MemberCtx;
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
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
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
      paidOn: todayIso(),
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
          <Avatar no={who.number} />
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
                  <Avatar no={m.number} />
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

          <p className="bq-rec-k">كيف دفع؟</p>
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

          {meth && meth !== "cash" && (
            <>
              <p className="bq-rec-k">رقم العملية (اختياري)</p>
              <input
                className="bq-input"
                value={txn}
                onChange={(e) => setTxn(e.target.value)}
                dir="ltr"
                inputMode="text"
                aria-label="رقم العملية"
              />
              <p className="bq-rec-k">صورة التحويل (اختياري)</p>
              <label className="bq-btn bq-btn-soft bq-press">
                {I.image(20)} {shot ? "تغيير الصورة" : "اختر صورة التحويل"}
                <input
                  type="file"
                  accept="image/*"
                  className="bq-sr"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    try {
                      setShot({ url: await compressImage(f), name: f.name });
                      setErr("");
                    } catch {
                      setErr("تعذّر قراءة الصورة. جرّب صورة أخرى.");
                    }
                  }}
                />
              </label>
              {shot && <p className="bq-hint">أُرفقت: {shot.name}</p>}
            </>
          )}

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
