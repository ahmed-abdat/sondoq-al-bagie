"use client";
// Copy that tells the truth (QA pass 5): «نُسخ» only after the clipboard write resolved; when the
// phone refuses, the text is shown selected so it can be copied by hand.

/** Copy for real: "copied" only after the clipboard write resolved, else "manual". */
export async function copyText(text: string): Promise<"copied" | "manual"> {
  try {
    if (!navigator.clipboard?.writeText) return "manual";
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "manual";
  }
}

/** The text in a field, already selected, when the phone did not let us copy it. */
export function ManualCopy({
  text,
  label = "انسخ الرابط يدويًا",
}: {
  text: string;
  label?: string;
}) {
  return (
    <label className="bq-rec-field">
      <span className="bq-rec-k">{label}</span>
      <input
        className="bq-input"
        dir="ltr"
        readOnly
        value={text}
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
      />
    </label>
  );
}
