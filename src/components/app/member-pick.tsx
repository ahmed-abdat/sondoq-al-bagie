"use client";
// Linking a committee account to a membership: the search (type, speak or «رقم») and the chosen
// member as one row. Used by «إضافة حساب», an account's sheet, «حسابي» and the first sign-in setup.
import { useState } from "react";
import { Avatar, MemberNo } from "./bits";
import { searchMembers } from "./derive";
import { I } from "./icons";
import { SearchField } from "./search-field";

export type Pickable = { memberId: string; memberRef: string; fullName: string };

/** Search results as rows; the keypad's «افتح» picks at once. */
export function MemberPick<T extends Pickable>({
  members,
  onPick,
  title = "من أنت في قائمة الأعضاء؟",
}: {
  members: T[];
  onPick: (m: T) => void;
  title?: string;
}) {
  const [q, setQ] = useState("");
  const res = q.trim() ? searchMembers(members, q).slice(0, 8) : [];
  return (
    <div className="bq-rec">
      <h2>{title}</h2>
      <SearchField
        value={q}
        onChange={setQ}
        placeholder="اكتب الاسم أو الرقم، مثل ب 12"
        label="ابحث عن العضو"
        members={members}
        onOpen={onPick}
        small
      />
      <ul className="bq-list bq-small-top">
        {res.map((m) => (
          <li key={m.memberId}>
            <button type="button" className="bq-row bq-press" onClick={() => onPick(m)}>
              <Avatar m={m} />
              <span className="bq-row-m">
                <span className="bq-row-t">{m.fullName}</span>
              </span>
              <span className="bq-chev">{I.go(18)}</span>
            </button>
          </li>
        ))}
      </ul>
      {q.trim() && !res.length && <p className="bq-hint">لم نجد عضوًا بهذا الاسم أو الرقم.</p>}
    </div>
  );
}

/** The chosen member as a row, with «تغيير» (and ✕ to clear when optional). */
export function PickedMember({
  m,
  onChange,
  onClear,
}: {
  m: Pickable;
  onChange?: () => void;
  onClear?: () => void;
}) {
  return (
    <div className="bq-row bq-mine">
      <Avatar m={m} />
      <span className="bq-row-m">
        <span className="bq-row-t">{m.fullName}</span>
        <span className="bq-row-s">
          رقم <MemberNo m={m} />
        </span>
      </span>
      {onChange && (
        <button type="button" className="bq-link bq-link-s bq-press" onClick={onChange}>
          تغيير
        </button>
      )}
      {onClear && (
        <button
          type="button"
          className="bq-icon-btn bq-press"
          onClick={onClear}
          aria-label="بدون عضوية"
        >
          {I.x(18)}
        </button>
      )}
    </div>
  );
}

/** A new password with «إظهار»: people type it on a phone keyboard, once. */
export function PasswordField({
  value,
  onChange,
  label = "كلمة سر جديدة",
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <label className="bq-pw">
      {label}
      <span className="bq-pw-box">
        <input
          className="bq-input"
          type={show ? "text" : "password"}
          dir="ltr"
          autoComplete="new-password"
          autoCapitalize="off"
          spellCheck={false}
          minLength={8}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby="bq-pw-rule"
        />
        <button
          type="button"
          className="bq-link bq-link-s bq-press bq-pw-eye"
          onClick={() => setShow((v) => !v)}
          aria-pressed={show}
        >
          {show ? "إخفاء" : "إظهار"}
        </button>
      </span>
      <span className="bq-hint" id="bq-pw-rule">
        8 أحرف أو أكثر
      </span>
    </label>
  );
}
