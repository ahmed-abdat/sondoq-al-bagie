"use client";
// «مشاركة التقرير»: one button, one sheet, four big one-tap options. The images and the PDF are
// rendered in the background as soon as the sheet opens (prepareReportShare), so the tap shares
// at once and stays within the browser's "user activation" window.
import { useEffect, useState } from "react";
import type { ReportData } from "@/lib/data/types";
import {
  prepareReportShare,
  shareReportImages,
  shareReportPdf,
  shareReportSummary,
} from "@/lib/share-report";
import { I } from "./icons";
import { Sheet } from "./sheet";
import { useCommitteeViewer } from "./viewer";

type Result = "shared" | "whatsapp" | "cancelled" | "downloaded" | "retry" | "copied";

const DONE: Record<Exclude<Result, "retry">, string> = {
  shared: "أُرسل التقرير.",
  whatsapp: "فُتح واتساب مع ملخص التقرير ورابطه.",
  cancelled: "",
  downloaded: "تم حفظ الملف في التنزيلات.",
  copied: "نُسخ الرابط. الصقه في مجموعة الواتساب.",
};

/**
 * Committee only (owner rule): visitors and members read the report; a signed-in committee member
 * (any role) also gets «مشاركة التقرير» and the #share sheet. Hidden until known, so no flash.
 */
export function ReportShare({
  data,
  autoOpen = false,
}: {
  /** the full report (with money): null until it arrives, and always null for strangers */
  data: ReportData | null;
  autoOpen?: boolean;
}) {
  const committee = useCommitteeViewer();
  if (!committee || !data)
    return (
      <div className="rp-tools">
        <PrintBtn />
      </div>
    );
  return <ShareTools data={data} autoOpen={autoOpen} />;
}

function PrintBtn() {
  return (
    <button
      type="button"
      className="bq-link bq-link-s bq-link-quiet bq-press"
      onClick={() => window.print()}
    >
      طباعة
    </button>
  );
}

function ShareTools({ data, autoOpen }: { data: ReportData; autoOpen: boolean }) {
  const committee = true;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [retry, setRetry] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    if (!committee || (!autoOpen && window.location.hash !== "#share")) return;
    const t = window.setTimeout(() => setOpen(true));
    return () => clearTimeout(t);
  }, [autoOpen, committee]);
  useEffect(() => {
    if (open) prepareReportShare(data);
  }, [open, data]);

  const run = async (key: string, f: () => Promise<Result>) => {
    setBusy(key);
    setMsg("");
    try {
      const r = await f();
      if (r === "retry") {
        // the files were not ready at the first tap; they are now (cached): one more tap shares
        setRetry(key);
      } else {
        setRetry(null);
        setMsg(DONE[r]);
      }
    } catch {
      setMsg("تعذّر تجهيز التقرير الآن. جرّب «نسخ الرابط».");
    } finally {
      setBusy(null);
    }
  };

  const options: {
    key: string;
    icon: React.ReactNode;
    title: string;
    sub: string;
    run: () => Promise<Result>;
  }[] = [
    {
      key: "images",
      icon: I.image(24),
      title: "صور لواتساب",
      sub: "صفحات التقرير صورًا، تُرسل دفعة واحدة",
      run: () => shareReportImages(data),
    },
    {
      key: "pdf",
      icon: I.save(24),
      title: "ملف PDF",
      sub: "التقرير كاملًا في ملف واحد",
      run: () => shareReportPdf(data),
    },
    {
      key: "summary",
      icon: I.image(24),
      title: "صورة الملخص فقط",
      sub: "صورة واحدة: ما في الصندوق ومن دفع",
      run: () => shareReportSummary(data),
    },
    {
      key: "link",
      icon: I.copy(24),
      title: "نسخ الرابط",
      sub: "يظهر في واتساب ببطاقة فيها الأرقام",
      run: async () => {
        await navigator.clipboard?.writeText(`${window.location.origin}/report`);
        return "copied";
      },
    },
  ];

  return (
    <>
      <div className="rp-tools">
        {committee && (
          <button
            type="button"
            className="bq-btn bq-btn-primary bq-btn-lg bq-press"
            onClick={() => setOpen(true)}
          >
            {I.wa(22)} مشاركة التقرير
          </button>
        )}
        <button
          type="button"
          className="bq-link bq-link-s bq-link-quiet bq-press"
          onClick={() => window.print()}
        >
          طباعة
        </button>
      </div>
      {open && committee && (
        <Sheet label="مشاركة التقرير" onDone={() => setOpen(false)}>
          <div className="bq-rec">
            <h2>مشاركة التقرير</h2>
            <ul className="bq-list bq-menu rp-share">
              {options.map((o) => (
                <li key={o.key}>
                  <button
                    type="button"
                    className="bq-row bq-press"
                    disabled={!!busy}
                    aria-busy={busy === o.key}
                    onClick={() => run(o.key, o.run)}
                  >
                    <span className="bq-disc is-in">
                      {busy === o.key ? <span className="bq-spin" /> : o.icon}
                    </span>
                    <span className="bq-row-m">
                      <span className="bq-row-t">
                        {retry === o.key ? "اضغط مرة أخرى" : o.title}
                      </span>
                      <span className="bq-row-s">
                        {busy === o.key
                          ? "جارٍ تجهيز التقرير…"
                          : retry === o.key
                            ? "الملف جاهز الآن."
                            : o.sub}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {msg && (
              <p className="bq-save is-saved" role="status">
                {msg}
              </p>
            )}
          </div>
        </Sheet>
      )}
    </>
  );
}
