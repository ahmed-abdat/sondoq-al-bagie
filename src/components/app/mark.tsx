// Compact confirmed seal for list rows (no client JS; kept apart from the heavy receipt module).
import { dayWords } from "./derive";

/** Compact seal for list rows: ~24px mark + «مؤكَّد · 28 سبتمبر». */
export function ConfirmedMark({ date, size = 24 }: { date: string; size?: number }) {
  return (
    <span className="rc-mark">
      <svg viewBox="0 0 28 28" width={size} height={size} aria-hidden="true">
        <circle cx="14" cy="14" r="12.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <circle
          cx="14"
          cy="14"
          r="10"
          fill="none"
          stroke="currentColor"
          strokeWidth=".8"
          strokeDasharray="1.2 1.6"
        />
        <path
          d="m9.6 14.3 3 3 5.8-6.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span>
        مؤكَّد <span aria-hidden="true">·</span> {dayWords(date)}
      </span>
    </span>
  );
}
