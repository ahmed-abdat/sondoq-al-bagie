"use client";
// Screen-only tools of /report: save as PDF (the browser's print → «حفظ بتنسيق PDF»), share the
// summary card (Lane B's PNG) or the link with a short text.
import { useState } from "react";
import {
  reportShareText,
  reportUrl,
  shareReportSummary,
  type ReportSource,
} from "@/lib/share-report";
import { waLink } from "@/lib/whatsapp";
import { I } from "./icons";

export function ReportTools({ data }: { data: ReportSource }) {
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
      <button
        type="button"
        className="bq-btn bq-btn-soft bq-press"
        onClick={() =>
          window.open(waLink(null, reportShareText(data, reportUrl(window.location.origin))), "_blank", "noopener")
        }
      >
        {I.wa(20)} مشاركة في واتساب
      </button>
    </div>
  );
}
