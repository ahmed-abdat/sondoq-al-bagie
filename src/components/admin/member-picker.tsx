"use client";
// The ONE member picker: a search by name or paper number in any form («ب 2», «ب2», «B-2», «2»),
// an optional starting list with its hint, and one row per member. Used by «سجّل دفعة», a new
// لوحة («أختارهم»), a member's report and moving members between الفئات.
import { useState } from "react";
import { safeStorage } from "@/lib/safe-storage";
import { searchMembers } from "@/components/app/derive";
import { Avatar, payStatus, useP, X } from "./kit";
import type { PMember } from "./types";

/** The last members this phone recorded payments for (ids, newest first). */
const RECENT_KEY = "bq-recent-payers";
export const readRecent = (): string[] => {
  try {
    const v = JSON.parse(safeStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 4) : [];
  } catch {
    return [];
  }
};
export const rememberRecent = (ids: string[]) =>
  safeStorage.setItem(
    RECENT_KEY,
    JSON.stringify([...new Set([...ids, ...readRecent()])].slice(0, 4)),
  );

/** One row the picker can offer: paper ref («A-4»), name, and a short line under it. */
export type Person = { id: string; ref: string; name: string; sub: string };

/** The admin screens' picker: active members, each with how far he has paid. */
export function MemberPicker({
  onPick,
  start,
  alreadyText,
  ...rest
}: Omit<SearchProps, "people" | "onPick" | "start" | "alreadyText"> & {
  onPick: (m: PMember) => void;
  start?: PMember[];
  alreadyText?: (m: PMember) => string;
}) {
  const { d } = useP();
  const active = d.members.filter((m) => m.status === "active");
  const byRef = new Map(active.map((m) => [m.ref, m]));
  const person = (m: PMember): Person => ({
    id: m.id,
    ref: m.ref,
    name: m.name,
    sub: payStatus(m),
  });
  return (
    <MemberSearch
      {...rest}
      people={active.map(person)}
      start={start?.map(person)}
      alreadyText={alreadyText && ((p) => alreadyText(byRef.get(p.ref)!))}
      onPick={(p) => onPick(byRef.get(p.ref)!)}
    />
  );
}

type SearchProps = {
  people: Person[];
  onPick: (p: Person) => void;
  /** refs not offered (already in this payment…) */
  exclude?: string[];
  /** refs shown with ✓ (multi-select) */
  selected?: string[];
  /** shown before anything is typed */
  start?: Person[];
  startHint?: string;
  /** when the search finds only excluded members: «فلان في هذه الدفعة.» */
  alreadyText?: (p: Person) => string;
  autoFocus?: boolean;
  label?: string;
};

/** The search and rows, for any list of people (الإعدادات has no admin data). */
export function MemberSearch({
  people,
  onPick,
  exclude = [],
  selected = [],
  start,
  startHint,
  alreadyText,
  autoFocus,
  label = "ابحث عن العضو",
}: SearchProps) {
  const [q, setQ] = useState("");
  const found = q.trim()
    ? searchMembers(
        people.map((p) => ({
          fullName: p.name,
          number: Number(p.ref.split("-")[1]) || 0,
          memberRef: p.ref,
          p,
        })),
        q,
      ).map((x) => x.p)
    : [];
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
                  <small>{m.sub}</small>
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
