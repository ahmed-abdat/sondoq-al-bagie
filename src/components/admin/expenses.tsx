"use client";
// «المصاريف» (المزيد): record one (amount, what, kind, from the fund or a campaign, which wallet),
// and every expense of the year. Any committee member records; «مسؤول» cancels with a reason.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useOnline } from "@/components/providers";
import { useAct } from "@/components/app/act";
import { CANCEL_REASONS } from "@/components/app/cancel-payment";
import { Back, CATEGORY, Chips, day, Money, Sheet, useP, X } from "./kit";
import { ExpenseSheet } from "./expense-sheet";
import type { PExpense } from "./types";

export function ExpensesScreen() {
  const { d } = useP();
  const [f, setF] = useState<"all" | "fund" | "camp">("all");
  const [add, setAdd] = useState(false);
  const [cancel, setCancel] = useState<PExpense | null>(null);
  const list = d.expenses.filter((e) =>
    f === "fund" ? !e.campaign : f === "camp" ? !!e.campaign : true,
  );
  return (
    <div className="pa-page">
      <Back to="more" label="المزيد" />
      <header className="pa-title">
        <h1>المصاريف</h1>
      </header>
      <p className="pa-lead">
        صُرف من الصندوق هذا العام: <Money v={d.spentYear} />
      </p>
      <button
        type="button"
        className="pa-btn pa-btn-primary pa-btn-block"
        onClick={() => setAdd(true)}
      >
        {X.plus(20)} سجّل مصروفًا
      </button>
      {d.campaigns.length > 0 && (
        <Chips
          label="تصفية"
          value={f}
          onChange={setF}
          options={[
            { k: "all", l: "الكل" },
            { k: "fund", l: "من الصندوق" },
            { k: "camp", l: "من التبرعات" },
          ]}
        />
      )}
      {list.length ? (
        <ul className="pa-rows">
          {list.map((e) => (
            <li key={e.id}>
              <div className="pa-row pa-row-plain">
                <span className="pa-ic">{X.bag(22)}</span>
                <span className="pa-row-t">
                  <b>{e.note || CATEGORY[e.category]}</b>
                  <small>
                    {day(e.at)} ·{" "}
                    {e.campaign
                      ? `تبرع: ${d.campaigns.find((c) => c.id === e.campaign)?.title ?? ""}`
                      : CATEGORY[e.category]}
                  </small>
                </span>
                <Money v={e.amount} unit={false} sign="−" />
                {d.me.admin && (
                  <button
                    type="button"
                    className="r2-x"
                    aria-label={`ألغِ مصروف ${e.note || CATEGORY[e.category]}`}
                    onClick={() => setCancel(e)}
                  >
                    {X.x(20)}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="pa-empty">لا مصاريف بعد.</p>
      )}
      <ExpenseSheet open={add} onClose={() => setAdd(false)} />
      {cancel && <CancelExpense e={cancel} onClose={() => setCancel(null)} />}
    </div>
  );
}

/** «مسؤول» only: the expense stays in the log with its reason and no longer counts. */
function CancelExpense({ e, onClose }: { e: PExpense; onClose: () => void }) {
  const { snack } = useP();
  const router = useRouter();
  const online = useOnline();
  const { cancelExpense } = useAct();
  const [why, setWhy] = useState("");
  const [other, setOther] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const reason = why === "أخرى" ? other.trim() : why;
  return (
    <Sheet
      open
      onClose={onClose}
      title="ألغِ المصروف"
      foot={
        <>
          {err && (
            <p className="pa-alert" role="alert">
              {err}
            </p>
          )}
          <button
            type="button"
            className="pa-btn pa-btn-primary pa-btn-block"
            disabled={!reason || busy || !online}
            onClick={async () => {
              setBusy(true);
              setErr("");
              const r = await cancelExpense({ id: e.id, reason }).catch(() => null);
              setBusy(false);
              if (!r?.ok) return setErr(r?.message ?? "تعذّر الإلغاء. حاول مرة أخرى.");
              router.refresh();
              onClose();
              snack("أُلغي المصروف.");
            }}
          >
            {busy ? "جارٍ الإلغاء…" : reason ? "ألغِ المصروف" : "اختر السبب"}
          </button>
        </>
      }
    >
      <p className="pa-quiet">
        {e.note || CATEGORY[e.category]} · <Money v={e.amount} />. يبقى في السجل مع السبب، ولا يُحسب
        بعد الآن.
      </p>
      <p className="pa-label">السبب</p>
      <Chips
        label="السبب"
        value={why}
        onChange={setWhy}
        options={CANCEL_REASONS.map((x) => ({ k: x, l: x }))}
      />
      {why === "أخرى" && (
        <label className="pa-field">
          <span>اكتب السبب</span>
          <input value={other} maxLength={200} onChange={(ev) => setOther(ev.target.value)} />
        </label>
      )}
    </Sheet>
  );
}
