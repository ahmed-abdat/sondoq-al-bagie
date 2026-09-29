"use client";
// Committee expenses: record one (with the invoice photo) and cancel with a reason.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { OfflineWriteHint, useOnline } from "@/components/providers";
import { compressImage, dataUrlToBlob } from "@/lib/compress-image";
import { useAct } from "./act";
import { sendOnce, useOnceId } from "./once-id";
import { failure } from "@/lib/data/errors";
import type { CampaignProgress, ExpenseAdmin, ExpenseCategory } from "@/lib/data/types";
import { todayIso } from "@/lib/dates";
import { parseAmount } from "@/lib/money";
import { CATEGORY_LABEL, dayWords, fmt } from "./derive";
import { DateField } from "./date-field";
import { I } from "./icons";
import { Num } from "./num";

const CATS = Object.keys(CATEGORY_LABEL) as ExpenseCategory[];
const REASONS = ["سُجّل مرتين", "المبلغ غير صحيح", "لم يُصرف", "أخرى"];

export function RecordExpenseBody({
  campaigns,
  onDone,
}: {
  campaigns: CampaignProgress[];
  onDone: (text: string) => void;
}) {
  const router = useRouter();
  const online = useOnline();
  const { recordExpense, uploadProof } = useAct();
  const once = useOnceId();
  const [cat, setCat] = useState<ExpenseCategory | null>(null);
  const [amountTxt, setAmountTxt] = useState("");
  const [note, setNote] = useState("");
  const [day, setDay] = useState(todayIso());
  const [from, setFrom] = useState<string>(""); // "" = main fund
  const [shot, setShot] = useState<{ url: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const amount = Math.round(parseAmount(amountTxt) ?? 0);
  const open = campaigns.filter((c) => c.status === "open");
  const ok = cat && amount > 0 && note.trim().length > 1;

  const submit = async () => {
    if (!ok || !cat) return;
    setBusy(true);
    setErr("");
    let r: Awaited<ReturnType<typeof recordExpense>>;
    try {
      // the same id on every retry: the server replays instead of recording twice
      r = await sendOnce(once, async (id) => {
        let receiptPath: string | undefined;
        if (shot) {
          const fd = new FormData();
          fd.set("file", dataUrlToBlob(shot.url), "invoice.jpg");
          fd.set("kind", "expenses");
          fd.set("id", id);
          const up = await uploadProof(fd);
          if (!up.ok) return up;
          receiptPath = up.data.path;
        }
        return recordExpense({
          id,
          spentOn: day,
          category: cat,
          amount,
          note: note.trim(),
          campaignId: from || undefined,
          receiptPath,
        });
      });
    } catch {
      r = failure("network");
    } finally {
      setBusy(false);
    }
    if (!r.ok) return setErr(r.message);
    router.refresh();
    onDone(`سُجّل مصروف «${note.trim()}».`);
  };

  return (
    <div className="bq-rec">
      <h2>سجّل مصروفًا</h2>
      <p className="bq-rec-k">على أي نشاط؟</p>
      <div className="bq-chips" role="radiogroup" aria-label="النشاط">
        {CATS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={cat === c}
            className="bq-chip bq-press"
            onClick={() => setCat(c)}
          >
            {CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>
      <p className="bq-rec-k">ماذا اشتُري؟</p>
      <input
        className="bq-input"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="مثل: كرات وأقمصة للفريق"
        aria-label="وصف المصروف"
      />
      <p className="bq-rec-k">المبلغ (أوقية قديمة)</p>
      <input
        className="bq-input"
        value={amountTxt}
        onChange={(e) => setAmountTxt(e.target.value)}
        inputMode="numeric"
        dir="ltr"
        aria-label="المبلغ بالأوقية"
      />
      <p className="bq-rec-k">التاريخ</p>
      <DateField value={day} onChange={setDay} label="تاريخ الصرف" noFuture />
      {open.length > 0 && (
        <>
          <p className="bq-rec-k">من أين صُرف؟</p>
          <div className="bq-chips" role="radiogroup" aria-label="مصدر المال">
            {[
              { id: "", t: "الصندوق الرئيسي" },
              ...open.map((c) => ({ id: c.campaignId, t: `حملة: ${c.title}` })),
            ].map((o) => (
              <button
                key={o.id || "main"}
                type="button"
                role="radio"
                aria-checked={from === o.id}
                className="bq-chip bq-press"
                onClick={() => setFrom(o.id)}
              >
                {o.t}
              </button>
            ))}
          </div>
        </>
      )}
      <p className="bq-rec-k">صورة الفاتورة (اختياري)</p>
      <label className="bq-btn bq-btn-soft bq-press">
        {I.image(20)} {shot ? "تغيير الصورة" : "اختر صورة الفاتورة"}
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
      <div className="bq-rec-foot">
        <p className="bq-rec-sum" aria-live="polite">
          <span className="bq-hint">المجموع</span>
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
          disabled={!ok || busy || !online}
          onClick={() => void submit()}
        >
          {busy ? "جارٍ الحفظ…" : "سجّل المصروف"}
        </button>
        <OfflineWriteHint />
      </div>
    </div>
  );
}

/** Recent expenses with an inline «إلغاء» that asks for a reason. */
export function ExpenseAdminList({
  items,
  onSay,
}: {
  items: ExpenseAdmin[];
  onSay: (t: string) => void;
}) {
  const router = useRouter();
  const online = useOnline();
  const { cancelExpense } = useAct();
  const [open, setOpen] = useState<string | null>(null);
  const [pick, setPick] = useState("");
  const [other, setOther] = useState("");
  const [gone, setGone] = useState<Record<string, string>>({});
  const reason = pick === "أخرى" ? other.trim() : pick;
  if (!items.length) return <p className="bq-hint">لم تُسجَّل مصاريف بعد.</p>;
  return (
    <ul className="bq-list">
      {items.map((e) => {
        const cancelled = e.cancelledAt || gone[e.id];
        return (
          <li key={e.id}>
            <div className="bq-row">
              <span className="bq-disc">{I.bag(22)}</span>
              <span className="bq-row-m">
                <span className="bq-row-t">{e.note ?? CATEGORY_LABEL[e.category]}</span>
                <span className="bq-row-s">
                  {CATEGORY_LABEL[e.category]} · {dayWords(e.spentOn)}
                  {e.campaignId ? " · من حملة" : ""}
                </span>
                {cancelled && (
                  <span className="bq-row-s">أُلغي: {e.cancelReason ?? gone[e.id]}</span>
                )}
              </span>
              <span className="bq-row-e">
                <Num className="bq-amt">{`−${fmt(e.amount)}`}</Num>
                {cancelled ? (
                  <span className="bq-kind is-rej">ملغى</span>
                ) : (
                  <button
                    type="button"
                    className="bq-link bq-link-s bq-link-quiet bq-press"
                    onClick={() => {
                      setOpen(open === e.id ? null : e.id);
                      setPick("");
                      setOther("");
                    }}
                    aria-expanded={open === e.id}
                  >
                    إلغاء
                  </button>
                )}
              </span>
            </div>
            {open === e.id && !cancelled && (
              <div className="bq-rej">
                <p className="bq-rej-l">لماذا تلغي هذا المصروف؟</p>
                <div className="bq-chips" role="radiogroup" aria-label="سبب الإلغاء">
                  {REASONS.map((x) => (
                    <button
                      key={x}
                      type="button"
                      role="radio"
                      aria-checked={pick === x}
                      className="bq-chip bq-press"
                      onClick={() => setPick(x)}
                    >
                      {x}
                    </button>
                  ))}
                </div>
                {pick === "أخرى" && (
                  <input
                    className="bq-input"
                    value={other}
                    onChange={(ev) => setOther(ev.target.value)}
                    placeholder="اكتب السبب باختصار"
                    aria-label="سبب الإلغاء"
                  />
                )}
                <div className="bq-slip-btns">
                  <button
                    type="button"
                    className="bq-btn bq-btn-tonal bq-press"
                    disabled={!reason || !online}
                    onClick={async () => {
                      const r = await cancelExpense({ id: e.id, reason });
                      if (!r.ok) return onSay(r.message);
                      setGone((g) => ({ ...g, [e.id]: reason }));
                      setOpen(null);
                      onSay("أُلغي المصروف");
                      router.refresh();
                    }}
                  >
                    ألغِ المصروف
                  </button>
                  <button
                    type="button"
                    className="bq-btn bq-btn-ghost bq-press"
                    onClick={() => setOpen(null)}
                  >
                    رجوع
                  </button>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
