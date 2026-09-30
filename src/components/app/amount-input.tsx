"use client";
// The ONE amount field (old ouguiya, whole numbers): number keyboard, left-to-right, Arabic or
// Persian digits turned Western as they are typed, anything but digits and spaces dropped
// («1.500» → «1500»). Callers read the value with amountValue().
import type { InputHTMLAttributes } from "react";
import { toWesternDigits } from "@/lib/money";

/** What the field keeps from what was typed or pasted. */
export const cleanAmount = (s: string) => toWesternDigits(s).replace(/[^\d ]/g, "");

/** The whole amount in the field (0 when empty). */
export const amountValue = (s: string) => Number(cleanAmount(s).replace(/ /g, "")) || 0;

export function AmountInput({
  value,
  onChange,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "inputMode" | "dir"> & {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      autoComplete="off"
      {...rest}
      value={value}
      inputMode="numeric"
      dir="ltr"
      onChange={(e) => onChange(cleanAmount(e.target.value))}
    />
  );
}
