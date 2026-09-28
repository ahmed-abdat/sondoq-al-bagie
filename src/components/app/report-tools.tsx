"use client";
// Screen-only tools of /report: save as PDF (the browser's print → «حفظ بتنسيق PDF»), share the
// summary card (Lane B's PNG) or the link with a short text.
import { useState } from "react";
import {
  reportShareText,
  reportUrl,
  shareReportSummary,
  type ReportSummaryData,
} from "@/lib/share-report";
import { waLink } from "@/lib/whatsapp";
import { I } from "./icons";

export function ReportTools({ data }: { data: ReportSummaryData }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="rp-tools" role="group" aria-label="حفظ التقرير ومشاركته">
      <button
        type="button"
        className="bq-btn bq-btn-primary bq-press"
        onClick={() => window.print()}
      >
        {I.save(20)} حفظ PDF
      </button>
      <button
        type="button"
        className="bq-btn bq-btn-soft bq-press"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await shareReportSummary(data);
          } finally {
            setBusy(false);
          }
        }}
      >
        {I.image(20)} صورة الملخص
      </button>
      <a
        className="bq-btn bq-btn-soft bq-press"
        href={
          typeof window === "undefined"
            ? "#"
            : waLink(null, reportShareText(data, reportUrl(window.location.origin)))
        }
        target="_blank"
        rel="noopener noreferrer"
      >
        {I.wa(20)} مشاركة في واتساب
      </a>
    </div>
  );
}
