"use client";
// The ONE member picker: a search by name or paper number in any form («ب 2», «ب2», «B-2», «2»),
// an optional starting list with its hint, and one row per member. Used by «سجّل دفعة», a new
// لوحة («أختارهم») and a member's report.
import { useState } from "react";
import { Avatar, findMembers, payStatus, useP, X } from "./kit";
import type { PMember } from "./types";

export function MemberPicker({
  onPick,
  exclude = [],
  selected = [],
  start,
  startHint,
  alreadyText,
  autoFocus,
  label = "ابحث عن العضو",
}: {
  onPick: (m: PMember) => void;
  /** refs not offered (already in this payment…) */
  exclude?: string[];
  /** refs shown with ✓ (multi-select) */
  selected?: string[];
  /** shown before anything is typed */
  start?: PMember[];
  startHint?: string;
  /** when the search finds only excluded members: «فلان في هذه الدفعة.» */
  alreadyText?: (m: PMember) => string;
  autoFocus?: boolean;
  label?: string;
}) {
  const { d } = useP();
  const [q, setQ] = useState("");
  const active = d.members.filter((m) => m.status === "active");
  const found = q.trim() ? findMembers(active, q) : [];
  const list = q.trim()
    ? found.filter((m) => !exclude.includes(m.ref)).slice(0, 8)
    : (start ?? []).filter((m) => !exclude.includes(m.ref));
  const already = found.find((m) => exclude.includes(m.ref));
  return (
    <div className="r2-picker">
      <label className="pa-search">
        {X.search(22)}
        <input
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="اسم العضو أو رقمه، مثل ب 12"
          aria-label={label}
        />
      </label>
      {!q && list.length > 0 && startHint && <p className="pa-hint">{startHint}</p>}
      <ul className="pa-rows">
        {list.map((m) => {
          const on = selected.includes(m.ref);
          return (
            <li key={m.ref}>
              <button
                type="button"
                className="pa-row"
                aria-pressed={selected.length ? on : undefined}
                onClick={() => onPick(m)}
              >
                <Avatar refs={m.ref} />
                <span className="pa-row-t">
                  <b>{m.name}</b>
                  <small>{payStatus(m)}</small>
                </span>
                {on ? X.check(20) : X.plus(20)}
              </button>
            </li>
          );
        })}
        {q && !list.length && (
          <li className="pa-empty">
            {already && alreadyText ? alreadyText(already) : "لا أحد بهذا الاسم أو الرقم."}
          </li>
        )}
      </ul>
    </div>
  );
}
