"use client";
// Linking a committee account to a membership: the shared member search and the chosen
// member as one row. Used by «إضافة حساب», an account's sheet, «حسابي» and the first sign-in setup.
import { useState } from "react";
import { Avatar, MemberNo } from "./bits";
import { MemberSearch } from "@/components/admin/member-picker";
import { I } from "./icons";

export type Pickable = { memberId: string; memberRef: string; fullName: string };

/** The shared member search (the same as «سجّل دفعة»), under a title. */
export function MemberPick<T extends Pickable>({
  members,
  onPick,
  title = "من أنت في قائمة الأعضاء؟",
}: {
  members: T[];
  onPick: (m: T) => void;
  title?: string;
}) {
  const byId = new Map(members.map((m) => [m.memberId, m]));
  return (
    <div className="bq-rec">
      <h2>{title}</h2>
      <MemberSearch
        people={members.map((m) => ({
          id: m.memberId,
          ref: m.memberRef,
          name: m.fullName,
          sub: "",
        }))}
        onPick={(p) => onPick(byId.get(p.id)!)}
      />
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
