"use client";
// Date and month pickers in Arabic words (the native pickers show the phone's language, often
// French or English). They open in the app's bottom sheet. Values stay ISO: "YYYY-MM-DD" / "YYYY-MM".
import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { MONTHS_AR, todayIso } from "@/lib/dates";
import { dayDate } from "./derive";
import { I } from "./icons";
import { Sheet } from "./sheet";

// Monday first (Mauritania's weekend is Saturday–Sunday); getDay(): 0 = Sunday
const WEEKDAYS_SHORT = ["ح", "ن", "ث", "ر", "خ", "ج", "س"];

const toIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fromIso = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12);
};
const yesterdayIso = () => {
  const d = fromIso(todayIso());
  d.setDate(d.getDate() - 1);
  return toIso(d);
};

export function DateField({
  value,
  onChange,
  label,
  noFuture = false,
  disabled = false,
  optional = false,
}: {
  /** "YYYY-MM-DD" or "" */
  value: string;
  onChange: (v: string) => void;
  label: string;
  /** paid on / spent on: no dates after today */
  noFuture?: boolean;
  disabled?: boolean;
  /** shows «بلا تاريخ» and a clear action */
  optional?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const today = todayIso();
  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };
  const text = !value ? "بلا تاريخ" : value === today ? `اليوم، ${dayDate(value)}` : dayDate(value);
  return (
    <>
      <button
        type="button"
        className="bq-input bq-date-btn bq-press"
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-label={`${label}: ${text}`}
      >
        {I.calendar(20)}
        <span>{text}</span>
      </button>
      {open && (
        <Sheet label={label} onDone={() => setOpen(false)}>
          <div className="bq-rec bq-cal">
            <h2>{label}</h2>
            <div className="bq-chips" role="group" aria-label="اختيار سريع">
              <button
                type="button"
                className="bq-chip bq-press"
                aria-pressed={value === today}
                onClick={() => pick(today)}
              >
                اليوم
              </button>
              <button
                type="button"
                className="bq-chip bq-press"
                aria-pressed={value === yesterdayIso()}
                onClick={() => pick(yesterdayIso())}
              >
                أمس
              </button>
              {optional && value && (
                <button type="button" className="bq-chip bq-press" onClick={() => pick("")}>
                  بلا تاريخ
                </button>
              )}
            </div>
            <Calendar
              mode="single"
              dir="rtl"
              weekStartsOn={1}
              selected={value ? fromIso(value) : undefined}
              defaultMonth={value ? fromIso(value) : fromIso(today)}
              onSelect={(d) => d && pick(toIso(d))}
              disabled={noFuture ? { after: fromIso(today) } : undefined}
              showOutsideDays={false}
              formatters={{
                formatCaption: (d) => `${MONTHS_AR[d.getMonth()]} ${d.getFullYear()}`,
                formatWeekdayName: (d) => WEEKDAYS_SHORT[d.getDay()],
                formatDay: (d) => String(d.getDate()),
              }}
              className="bq-cal-rdp w-full [--cell-size:44px]"
            />
          </div>
        </Sheet>
      )}
    </>
  );
}

/** Month only (e.g. «ابتداءً من شهر»): a 12-month grid with a year stepper. Value "YYYY-MM". */
export function MonthPicker({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [y0, m0] = value.split("-").map(Number);
  const [year, setYear] = useState(y0);
  return (
    <>
      <button
        type="button"
        className="bq-input bq-date-btn bq-press"
        onClick={() => setOpen(true)}
        aria-label={label}
      >
        {I.calendar(20)}
        <span>
          {MONTHS_AR[m0 - 1]} {y0}
        </span>
      </button>
      {open && (
        <Sheet label={label} onDone={() => setOpen(false)}>
          <div className="bq-rec">
            <h2>{label}</h2>
            <div className="bq-year">
              <button
                type="button"
                className="bq-icon-btn bq-press"
                onClick={() => setYear(year - 1)}
                aria-label="السنة السابقة"
              >
                {I.back(20)}
              </button>
              <strong>
                <bdi dir="ltr" className="bq-num">
                  {year}
                </bdi>
              </strong>
              <button
                type="button"
                className="bq-icon-btn bq-press"
                onClick={() => setYear(year + 1)}
                aria-label="السنة التالية"
              >
                {I.go(20)}
              </button>
            </div>
            <ol className="bq-mstrip bq-month-grid" aria-label={`أشهر ${year}`}>
              {MONTHS_AR.map((name, i) => {
                const v = `${year}-${String(i + 1).padStart(2, "0")}`;
                return (
                  <li key={name}>
                    <button
                      type="button"
                      className="bq-mpick bq-press"
                      aria-pressed={v === value}
                      onClick={() => {
                        onChange(v);
                        setOpen(false);
                      }}
                    >
                      {name}
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        </Sheet>
      )}
    </>
  );
}
