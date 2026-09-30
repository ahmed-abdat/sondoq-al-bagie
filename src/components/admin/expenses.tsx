"use client";
// «المصاريف» (المزيد): record one (amount, activity, what, from the fund or a campaign, which wallet),
// and every expense of the year. Any committee member records; «مسؤول» cancels with a reason.
import { useState } from "react";
import { useAct } from "@/components/app/act";
import { Back, Chips, day, Money, useP, X } from "./kit";
import { ExpenseSheet } from "./expense-sheet";
import { CancelSheet } from "./cancel-sheet";
import type { PExpense } from "./types";

export function ExpensesScreen() {
  const { d } = useP();
  const [f, setF] = useState<"all" | "fund" | "camp">("all");
  const [add, setAdd] = useState(false);
  const [cancel, setCancel] = useState<PExpense | null>(null);
  // paid from a تبرع or a لوحة (not the fund)
  const from = (e: PExpense) => {
    if (!e.campaign) return "";
    const c = d.campaigns.find((x) => x.id === e.campaign);
    if (c) return `تبرع: ${c.title}`;
    const l = d.levies.find((x) => x.id === e.campaign);
    return l ? `لوحة: ${l.title}` : "";
  };
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
        مصاريف الصندوق هذا العام: <Money v={d.spentYear} />
      </p>
      <button
        type="button"
        className="pa-btn pa-btn-primary pa-btn-block"
        onClick={() => setAdd(true)}
      >
        {X.plus(20)} سجّل مصروفًا
      </button>
      {d.expenses.some((e) => e.campaign) && (
        <Chips
          label="تصفية"
          value={f}
          onChange={setF}
          options={[
            { k: "all", l: "الكل" },
            { k: "fund", l: "من الصندوق" },
            { k: "camp", l: "من التبرعات واللوحات" },
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
                  <b>{e.note || e.activity}</b>
                  <small>
                    {[day(e.at), e.activity, from(e), e.wallet].filter(Boolean).join(" · ")}
                  </small>
                  {e.by && <small>سجّله {e.by}</small>}
                </span>
                <Money v={e.amount} unit={false} sign="−" />
                {d.me.admin && (
                  <button
                    type="button"
                    className="r2-x"
                    aria-label={`ألغِ مصروف ${e.note || e.activity}`}
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
  const { cancelExpense } = useAct();
  return (
    <CancelSheet
      title="ألغِ المصروف"
      onClose={onClose}
      done="أُلغي المصروف."
      onCancel={(reason) =>
        cancelExpense({ id: e.id, reason }).then((r) =>
          r.ok ? { ok: true as const } : { ok: false as const, message: r.message },
        )
      }
    >
      {e.note || e.activity} · <Money v={e.amount} />. يبقى في السجل مع السبب، ولا يُحسب بعد الآن.
    </CancelSheet>
  );
}
