"use client";
// «مشاركة التقرير»: one button, one sheet, four big one-tap options. The images and the PDF are
// rendered in the background as soon as the sheet opens (prepareReportShare), so the tap shares
// at once and stays within the browser's "user activation" window.
import { useEffect, useMemo, useState } from "react";
import type { FundAccount, ReportData } from "@/lib/data/types";
import { METHOD_LABELS } from "@/lib/methods";
import {
  hasReminder,
  type PayAccount,
  prepareReminderShare,
  prepareReportShare,
  shareReminderImages,
  shareReminderPdf,
  shareReportImages,
  shareReportPdf,
  shareReportSummary,
} from "@/lib/share-report";
import { I } from "./icons";
import { Sheet } from "./sheet";
import { copyText, ManualCopy } from "./copy";
import { useCommitteeViewer } from "./viewer";

type Result = "shared" | "whatsapp" | "cancelled" | "downloaded" | "retry" | "copied" | "manual";

// only what the app knows (QA pass 5): a share sheet or a draft opened, never «أُرسل»
const DONE: Record<Exclude<Result, "retry" | "manual">, string> = {
  shared: "",
  whatsapp: "فُتح واتساب بملخص التقرير ورابطه. اضغط إرسال هناك.",
  cancelled: "",
  downloaded: "حُفظ الملف في التنزيلات.",
  copied: "نُسخ الرابط. الصقه في مجموعة الواتساب.",
};

/**
 * Committee only (owner rule): visitors and members read the report; a signed-in committee member
 * (any role) also gets «مشاركة التقرير» and the #share sheet. Hidden until known, so no flash.
 */
export function ReportShare({
  data,
  accounts = [],
  autoOpen = false,
}: {
  /** the full report (with money): null until it arrives, and always null for strangers */
  data: ReportData | null;
  /** the fund's public wallets, for «ادفع عبر: …» in the fee reminder */
  accounts?: FundAccount[];
  autoOpen?: boolean;
}) {
  const committee = useCommitteeViewer();
  if (!committee || !data)
    return (
      <div className="rp-tools">
        <PrintBtn />
      </div>
    );
  return <ShareTools data={data} accounts={accounts} autoOpen={autoOpen} />;
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

function ShareTools({
  data,
  accounts,
  autoOpen,
}: {
  data: ReportData;
  accounts: FundAccount[];
  autoOpen: boolean;
}) {
  const committee = true;
  // «التقرير كاملًا» or the fee reminder «من عليه رسوم فقط» (same grid, only who owes, no money)
  const [kind, setKind] = useState<"full" | "reminder">("full");
  const canRemind = hasReminder(data);
  const pay = useMemo<PayAccount[]>(
    () =>
      accounts.map((a) => ({
        method: a.method,
        accountNumber: a.accountNumber,
        label: METHOD_LABELS[a.method],
      })),
    [accounts],
  );
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [retry, setRetry] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [manual, setManual] = useState(false);
  useEffect(() => {
    if (!committee || (!autoOpen && window.location.hash !== "#share")) return;
    const t = window.setTimeout(() => setOpen(true));
    return () => clearTimeout(t);
  }, [autoOpen, committee]);
  useEffect(() => {
    if (!open) return;
    if (kind === "reminder") prepareReminderShare(data, pay);
    else prepareReportShare(data);
  }, [open, data, kind, pay]);

  const run = async (key: string, f: () => Promise<Result>) => {
    setBusy(key);
    setMsg("");
    try {
      const r = await f();
      if (r === "retry") {
        // the files were not ready at the first tap; they are now (cached): one more tap shares
        setRetry(key);
      } else if (r === "manual") {
        setRetry(null);
        setManual(true);
      } else {
        setRetry(null);
        setManual(false);
        setMsg(
          r === "whatsapp" && kind === "reminder"
            ? "فُتح واتساب بنص التذكير ورابط التطبيق. اضغط إرسال هناك."
            : DONE[r],
        );
      }
    } catch {
      setMsg("تعذّر تجهيز التقرير الآن. جرّب «نسخ الرابط».");
    } finally {
      setBusy(null);
    }
  };

  type Option = {
    key: string;
    icon: React.ReactNode;
    title: string;
    sub: string;
    run: () => Promise<Result>;
  };
  const reminderOptions: Option[] = [
    {
      key: "r-images",
      icon: I.image(24),
      title: "صور لواتساب",
      sub: "أسماء من عليه رسوم، مع طريقة الدفع",
      run: () => shareReminderImages(data, pay),
    },
    {
      key: "r-pdf",
      icon: I.save(24),
      title: "ملف PDF",
      sub: "تذكير بالرسوم في ملف واحد",
      run: () => shareReminderPdf(data, pay),
    },
  ];
  const fullOptions: Option[] = [
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
      // «نُسخ» only once the clipboard said yes; else the link, selected, to copy by hand
      run: () => copyText(`${window.location.origin}/report`),
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
            <div className="bq-chips" role="group" aria-label="ماذا تشارك؟">
              <button
                type="button"
                className="bq-chip bq-press"
                aria-pressed={kind === "full"}
                onClick={() => setKind("full")}
              >
                التقرير كاملًا
              </button>
              <button
                type="button"
                className="bq-chip bq-press"
                aria-pressed={kind === "reminder"}
                disabled={!canRemind}
                onClick={() => setKind("reminder")}
              >
                من عليه رسوم فقط
              </button>
            </div>
            {!canRemind && <p className="bq-hint">لا أحد عليه رسوم الآن.</p>}
            <ul className="bq-list bq-menu rp-share">
              {(kind === "reminder" ? reminderOptions : fullOptions).map((o) => (
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
            <p className="bq-hint">اختر واتساب ثم اضغط إرسال.</p>
            {manual && <ManualCopy text={`${window.location.origin}/report`} />}
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
