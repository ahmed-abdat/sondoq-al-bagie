"use client";
// «النشاط» (plan §13) inside الإعدادات: the list the expense sheet offers («لأي نشاط؟»).
// «المسؤول» adds, renames (past expenses show the new name) and stops one (its past expenses keep
// it; it is no longer offered); a stopped one can come back. The last active one cannot stop.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { OfflineWriteHint, useOnline } from "@/components/providers";
import type { ExpenseActivity } from "@/lib/data/types";
import { useAct } from "./act";
import { I } from "./icons";
import { useSnack } from "./shell";

type Row = { id: number; name: string; active: boolean };

export function ActivitiesSection({
  activities,
  admin,
}: {
  activities: ExpenseActivity[];
  admin: boolean;
}) {
  const router = useRouter();
  const online = useOnline();
  const say = useSnack();
  const { addExpenseActivity, renameExpenseActivity, setExpenseActivityActive } = useAct();
  // shown at once after a save (the demo simulates writes, so the server list does not change)
  const [list, setList] = useState<Row[]>(() =>
    [...activities]
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
      .map(({ id, name, active }) => ({ id, name, active })),
  );
  const [adding, setAdding] = useState("");
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
  const [stopping, setStopping] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const active = list.filter((a) => a.active);
  const stopped = list.filter((a) => !a.active);
  const taken = (name: string, id?: number) =>
    list.some((a) => a.id !== id && a.name.trim() === name.trim());

  const run = async (
    fn: () => Promise<{ ok: true; data?: unknown } | { ok: false; message: string }>,
    done: (data: unknown) => void,
  ) => {
    setBusy(true);
    setErr("");
    let r: { ok: true; data?: unknown } | { ok: false; message: string };
    try {
      r = await fn();
    } catch {
      r = { ok: false, message: "تعذّر الاتصال. تحقّق من الإنترنت وحاول مرة أخرى." };
    }
    setBusy(false);
    if (!r.ok) return setErr(r.message);
    done(r.data);
    router.refresh();
  };

  const add = () => {
    const name = adding.trim();
    if (!name || taken(name)) return;
    void run(
      () => addExpenseActivity({ name }),
      (id) => {
        setList((l) => {
          // new ones go before «أخرى», as on the server
          const other = l.findIndex((a) => a.name === "أخرى");
          const row = { id: Number(id), name, active: true };
          return other < 0 ? [...l, row] : [...l.slice(0, other), row, ...l.slice(other)];
        });
        setAdding("");
        say(`أُضيف النشاط «${name}».`);
      },
    );
  };

  const rename = () => {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name || taken(name, editing.id)) return;
    const id = editing.id;
    void run(
      () => renameExpenseActivity({ id, name }),
      () => {
        setList((l) => l.map((a) => (a.id === id ? { ...a, name } : a)));
        setEditing(null);
        say("تغيّر اسم النشاط.");
      },
    );
  };

  const setActive = (a: Row, on: boolean) =>
    run(
      () => setExpenseActivityActive({ id: a.id, active: on }),
      () => {
        setList((l) => l.map((x) => (x.id === a.id ? { ...x, active: on } : x)));
        setStopping(null);
        say(on ? `عاد النشاط «${a.name}».` : `أُوقف النشاط «${a.name}».`);
      },
    );

  return (
    <section className="bq-sec" aria-labelledby="bq-acts-h">
      <h2 id="bq-acts-h">النشاط</h2>
      <p className="bq-lead">
        {admin
          ? "ما يُختار عند تسجيل مصروف. تغيير الاسم يظهر في المصاريف السابقة أيضًا."
          : "ما يُختار عند تسجيل مصروف. يغيّره المسؤول فقط."}
      </p>
      <ul className="bq-list">
        {active.map((a) => (
          <li key={a.id} className="bq-group-row">
            {editing?.id === a.id ? (
              <span className="bq-act-edit">
                <input
                  className="bq-input"
                  value={editing.name}
                  maxLength={60}
                  autoFocus
                  aria-label={`الاسم الجديد لـ ${a.name}`}
                  onChange={(e) => setEditing({ id: a.id, name: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && rename()}
                />
                <span className="bq-group-acts">
                  <button
                    type="button"
                    className="bq-btn bq-btn-primary bq-press"
                    disabled={
                      busy ||
                      !online ||
                      !editing.name.trim() ||
                      editing.name.trim() === a.name ||
                      taken(editing.name, a.id)
                    }
                    onClick={rename}
                  >
                    احفظ
                  </button>
                  <button
                    type="button"
                    className="bq-btn bq-btn-ghost bq-press"
                    onClick={() => setEditing(null)}
                  >
                    إلغاء
                  </button>
                </span>
              </span>
            ) : (
              <>
                <span className="bq-row-m">
                  <span className="bq-row-t">{a.name}</span>
                </span>
                {admin && (
                  <span className="bq-group-acts">
                    <button
                      type="button"
                      className="bq-btn bq-btn-soft bq-press"
                      aria-label={`غيّر اسم ${a.name}`}
                      onClick={() => {
                        setStopping(null);
                        setEditing({ id: a.id, name: a.name });
                      }}
                    >
                      غيّر الاسم
                    </button>
                    {active.length > 1 && (
                      <button
                        type="button"
                        className="bq-btn bq-btn-ghost bq-press"
                        aria-label={stopping === a.id ? `نعم، أوقف ${a.name}` : `أوقف ${a.name}`}
                        disabled={busy || !online}
                        onClick={() =>
                          stopping === a.id ? void setActive(a, false) : setStopping(a.id)
                        }
                      >
                        {stopping === a.id ? "نعم، أوقفه" : "أوقفه"}
                      </button>
                    )}
                  </span>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      {stopping !== null && (
        <p className="bq-hint" role="status">
          لن يُعرض عند تسجيل مصروف. مصاريفه السابقة تبقى كما هي.
        </p>
      )}
      {admin && (
        <div className="bq-field">
          <input
            className="bq-input bq-grow-1"
            value={adding}
            maxLength={60}
            placeholder="مثل: رحلة الشباب"
            aria-label="اسم النشاط الجديد"
            onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <button
            type="button"
            className="bq-btn bq-btn-soft bq-press"
            disabled={busy || !online || !adding.trim() || taken(adding)}
            onClick={add}
          >
            {I.plus(18)} أضف
          </button>
        </div>
      )}
      {admin && adding.trim() && taken(adding) && (
        <p className="bq-hint" role="status">
          هذا النشاط موجود.
        </p>
      )}
      {stopped.length > 0 && (
        <>
          <h3 className="bq-h3">نشاط متوقف</h3>
          <ul className="bq-list">
            {stopped.map((a) => (
              <li key={a.id} className="bq-group-row is-off">
                <span className="bq-row-m">
                  <span className="bq-row-t">{a.name}</span>
                </span>
                {admin && (
                  <button
                    type="button"
                    className="bq-btn bq-btn-soft bq-press"
                    aria-label={`أعِد ${a.name}`}
                    disabled={busy || !online}
                    onClick={() => void setActive(a, true)}
                  >
                    أعِده
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {err && (
        <p className="bq-alert" role="alert">
          {err}
        </p>
      )}
      {admin && <OfflineWriteHint />}
    </section>
  );
}
