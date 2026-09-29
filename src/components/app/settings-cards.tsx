"use client";
// Two settings cards: «الرسوم الشهرية» for the coming year (admin, from 1 December, or when this
// year has none), and «آخر نسخة احتياطية» (the weekly backup: ok, failed, never).
import { useRouter } from "next/navigation";
import { useState } from "react";
import { OfflineWriteHint, useOnline } from "@/components/providers";
import type { BackupStatus } from "@/lib/data/types";
import { toWesternDigits } from "@/lib/money";
import { useAct } from "./act";
import { dayDate, fmt, groupLabel, relativeAgo } from "./derive";
import { I } from "./icons";
import { Num, useNow } from "./num";
import { IDLE, runSave, SaveNote, type SaveState } from "./views/settings";

/** This year's fees, read only, every day of the year (audit C14). */
export function CurrentPrices({ year, prices }: { year: number; prices: Record<string, number> }) {
  const groups = Object.keys(prices).sort();
  if (!groups.length) return null;
  return (
    <section className="bq-sec" aria-labelledby="bq-cp-h">
      <h2 id="bq-cp-h">الرسوم الشهرية {year}</h2>
      <p className="bq-lead">
        {groups.map((g, i) => (
          <span key={g} className="bq-nowrap">
            {i ? " · " : ""}المجموعة {groupLabel(g)} <Num>{fmt(prices[g])}</Num> أوقية
          </span>
        ))}
      </p>
    </section>
  );
}

export function YearPrices({
  year,
  groups,
  current,
  set,
  admin,
}: {
  /** the year being priced */
  year: number;
  /** group codes, e.g. ["A", "B"] */
  groups: string[];
  /** the latest known price per group (a starting value) */
  current: Record<string, number>;
  /** prices already set for `year` */
  set: Record<string, number>;
  admin: boolean;
}) {
  const missing = groups.filter((g) => !set[g]);
  return (
    <section className="bq-sec" aria-labelledby="bq-yp-h">
      <h2 id="bq-yp-h">الرسوم الشهرية لسنة {year}</h2>
      <p className="bq-lead">
        {missing.length
          ? `حدد الرسوم الشهرية لسنة ${year} قبل بدايتها، وإلا لا تُسجَّل رسوم أشهرها.`
          : `حُددت الرسوم الشهرية لسنة ${year}.`}
      </p>
      <ul className="bq-list">
        {groups.map((g) => (
          <PriceRow
            key={g}
            year={year}
            group={g}
            saved={set[g] ?? null}
            start={set[g] ?? current[g] ?? 0}
            admin={admin}
          />
        ))}
      </ul>
      {!admin && <p className="bq-hint">يحددها المسؤول.</p>}
      <OfflineWriteHint />
    </section>
  );
}

function PriceRow({
  year,
  group,
  saved: initial,
  start,
  admin,
}: {
  year: number;
  group: string;
  saved: number | null;
  start: number;
  admin: boolean;
}) {
  const router = useRouter();
  const online = useOnline();
  const { setGroupPrice } = useAct();
  const [txt, setTxt] = useState(start ? String(start) : "");
  const [saved, setSaved] = useState(initial);
  const [st, setSt] = useState<SaveState>(IDLE);
  const n = Number(txt) || 0;
  const id = `bq-yp-${group}`;
  return (
    <li className="bq-yp-row">
      <label className="bq-field">
        <span className="bq-strong bq-yp-g">المجموعة {groupLabel(group)}</span>
        <input
          className="bq-input bq-grow-1"
          value={txt}
          onChange={(e) => setTxt(toWesternDigits(e.target.value).replace(/[^\d]/g, ""))}
          inputMode="numeric"
          dir="ltr"
          aria-label={`الرسوم الشهرية للمجموعة ${groupLabel(group)} بالأوقية القديمة`}
          aria-describedby={id}
          disabled={!admin}
        />
        {admin && n > 0 && n !== saved && (
          <button
            type="button"
            className="bq-btn bq-btn-primary bq-press"
            disabled={!online || st.status === "saving"}
            onClick={async () => {
              const ok = await runSave(setSt, () =>
                setGroupPrice({ groupCode: group, year, monthlyAmount: n }),
              );
              if (ok) {
                setSaved(n);
                router.refresh();
              }
            }}
          >
            حفظ
          </button>
        )}
      </label>
      {st.status === "idle" ? (
        <p className="bq-hint" id={id}>
          {saved ? (
            <>
              {I.check(16)} <Num>{fmt(saved)}</Num> أوقية في الشهر
            </>
          ) : (
            "لم تُحدد بعد"
          )}
        </p>
      ) : (
        <SaveNote id={id} s={st} />
      )}
    </li>
  );
}

export function BackupCard({ status }: { status: BackupStatus | null }) {
  const now = useNow();
  const when = (iso: string) => (now ? relativeAgo(iso, now) : dayDate(iso));
  return (
    <section className="bq-sec" aria-labelledby="bq-bk-h">
      <h2 id="bq-bk-h">آخر نسخة احتياطية</h2>
      {!status ? (
        <p className="bq-lead">لم تُصنع نسخة احتياطية بعد. تُصنع كل أسبوع تلقائيًا.</p>
      ) : status.ok ? (
        <p className="bq-lead">
          {I.check(18)} نجحت {when(status.lastRunAt)}. تُصنع كل أسبوع تلقائيًا.
        </p>
      ) : (
        <div className="bq-wait" role="status">
          <p>فشلت النسخة الاحتياطية الأسبوعية {when(status.lastRunAt)}. راجع المسؤول التقني.</p>
          {status.lastOkAt && <p>آخر نسخة ناجحة: {dayDate(status.lastOkAt)}.</p>}
          {status.detail && (
            <p className="bq-hint" dir="ltr">
              {status.detail}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
