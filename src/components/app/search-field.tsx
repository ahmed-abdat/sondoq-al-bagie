"use client";
// The one member search box: type, speak (🎤, where the phone supports it) or tap the number on
// a big keypad («رقم»). Used on home, /members, the record-payment list and committee lists.
import { useState } from "react";
import { memberLabel, searchMembers, splitRef } from "./derive";
import { I } from "./icons";
import { Sheet } from "./sheet";
import { spokenToQuery } from "./search-text";
import { useSpeech } from "./use-speech";

type Findable = { memberRef: string; fullName: string };

export function SearchField<T extends Findable>({
  value,
  onChange,
  placeholder,
  label,
  members,
  onOpen,
  small = false,
  autoFocus,
  onFocus,
  className = "",
}: {
  value: string;
  onChange: (q: string) => void;
  placeholder: string;
  label: string;
  /** for the keypad preview */
  members: T[];
  /** the keypad's «افتح»; without it the number goes into the search box */
  onOpen?: (m: T) => void;
  small?: boolean;
  autoFocus?: boolean;
  /** e.g. home: bring the field up above the phone keyboard */
  onFocus?: () => void;
  className?: string;
}) {
  const [pad, setPad] = useState(false);
  const speech = useSpeech((text) => onChange(spokenToQuery(text)));
  const listening = speech.state === "listening";
  return (
    <>
      <label
        className={`bq-search ${small ? "bq-search-s" : ""} ${listening ? "is-listening" : ""} ${className}`}
      >
        {I.search(small ? 22 : 24)}
        <input
          value={value}
          onChange={(e) => {
            speech.reset();
            onChange(e.target.value);
          }}
          placeholder={listening ? "أستمع… قل الاسم أو الرقم" : placeholder}
          aria-label={label}
          type="search"
          enterKeyHint="search"
          autoFocus={autoFocus}
          onFocus={onFocus}
        />
        {value && !listening && (
          <button
            type="button"
            className="bq-press"
            onClick={() => onChange("")}
            aria-label="امسح البحث"
          >
            {I.x(20)}
          </button>
        )}
        {speech.supported && (
          <button
            type="button"
            className={`bq-press bq-mic ${listening ? "is-on" : ""}`}
            onClick={() => (listening ? speech.stop() : speech.start())}
            aria-label={listening ? "أوقف الاستماع" : "ابحث بالصوت"}
            aria-pressed={listening}
          >
            {I.mic(22)}
          </button>
        )}
        <button
          type="button"
          className="bq-press bq-padbtn"
          onClick={() => setPad(true)}
          aria-label="اكتب الرقم بلوحة الأرقام"
        >
          {I.keypad(22)}
        </button>
      </label>
      {speech.state === "denied" && (
        <p className="bq-hint bq-search-note" role="status">
          لم يُسمح باستعمال الميكروفون. يمكنك الكتابة أو استعمال لوحة الأرقام.
        </p>
      )}
      {speech.state === "failed" && (
        <p className="bq-hint bq-search-note" role="status">
          لم أسمع جيدًا. اضغط الميكروفون مرة أخرى، أو اكتب.
        </p>
      )}
      {pad && (
        <Sheet label="اكتب الرقم" onDone={() => setPad(false)}>
          <Keypad
            members={members}
            onUse={(q, m) => {
              setPad(false);
              if (m && onOpen) onOpen(m);
              else onChange(q);
            }}
          />
        </Sheet>
      )}
    </>
  );
}

function Keypad<T extends Findable>({
  members,
  onUse,
}: {
  members: T[];
  onUse: (q: string, m?: T) => void;
}) {
  const [letter, setLetter] = useState<"أ" | "ب" | "">("");
  const [digits, setDigits] = useState("");
  const q = `${letter}${letter && digits ? " " : ""}${digits}`;
  const found = digits
    ? searchMembers(members, q).filter((m) => String(splitRef(m.memberRef).n) === digits)
    : [];
  const type = (d: string) => setDigits((x) => (x.length >= 3 ? x : (x + d).replace(/^0+/, "")));
  return (
    <div className="bq-pad">
      <h2>رقم العضو</h2>
      <div className="bq-pad-letters" role="radiogroup" aria-label="المجموعة">
        {(["أ", "ب"] as const).map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={letter === l}
            className="bq-pad-key bq-press"
            onClick={() => setLetter(letter === l ? "" : l)}
          >
            {l}
          </button>
        ))}
      </div>
      <p className="bq-pad-shown" aria-live="polite">
        <bdi className="bq-num">{q || "…"}</bdi>
      </p>
      <div className="bq-pad-found">
        {digits && !found.length && <p className="bq-hint">لا يوجد عضو بهذا الرقم.</p>}
        {found.slice(0, 2).map((m) => (
          <button
            key={m.memberRef}
            type="button"
            className="bq-pad-hit bq-press"
            onClick={() => onUse(q, m)}
          >
            <bdi className="bq-num">{memberLabel(m)}</bdi> · {m.fullName}
            <span className="bq-pad-go">{I.go(18)}</span>
          </button>
        ))}
      </div>
      <div className="bq-pad-grid" dir="ltr">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" className="bq-pad-key bq-press" onClick={() => type(d)}>
            {d}
          </button>
        ))}
        <button
          type="button"
          className="bq-pad-key bq-press"
          onClick={() => setDigits((x) => x.slice(0, -1))}
          aria-label="امسح رقمًا"
        >
          ⌫
        </button>
        <button type="button" className="bq-pad-key bq-press" onClick={() => type("0")}>
          0
        </button>
        <button
          type="button"
          className="bq-pad-key bq-pad-ok bq-press"
          disabled={!digits}
          onClick={() => onUse(q, found.length === 1 ? found[0] : undefined)}
          aria-label="ابحث بهذا الرقم"
        >
          {I.search(22)}
        </button>
      </div>
    </div>
  );
}
