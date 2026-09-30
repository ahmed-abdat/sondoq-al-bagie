"use client";
// «آخر نسخة احتياطية» (the weekly backup: ok, failed, never). The fees live in «الفئات».
import type { BackupStatus } from "@/lib/data/types";
import { dayDate, relativeAgo } from "./derive";
import { I } from "./icons";
import { useNow } from "./num";

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
