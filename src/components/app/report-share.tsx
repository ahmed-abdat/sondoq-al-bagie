"use client";
// «مشاركة التقرير»: one button, one sheet, four big one-tap options. The images and the PDF are
// rendered in the background as soon as the sheet opens (prepareReportShare), so the tap shares
// at once and stays within the browser's "user activation" window.
import { useEffect, useState } from "react";
import type { ReportData } from "@/lib/data/types";
import { checkLabel, CHECK_MEANINGS, type CheckMeaning } from "@/lib/report-check";
import { safeStorage } from "@/lib/safe-storage";
import {
  prepareReportShare,
  shareReportImages,
  shareReportPdf,
  shareReportSummary,
} from "@/lib/share-report";
import { I } from "./icons";
import { Sheet } from "./sheet";

// «✓ يعني»: the last choice is kept on this device
const CHECK_KEY = "bq-report-check";
const CHECK_CHIP: Record<CheckMeaning, string> = { now: "دفع حتى الآن", year: "دفع السنة كاملة" };
const readCheck = (): CheckMeaning => {
  const v = safeStorage.getItem(CHECK_KEY);
  return CHECK_MEANINGS.includes(v as CheckMeaning) ? (v as CheckMeaning) : "now";
};

type Result = "shared" | "whatsapp" | "cancelled" | "downloaded" | "retry" | "copied";

const DONE: Record<Exclude<Result, "retry">, string> = {
  shared: "أُرسل التقرير.",
  whatsapp: "فُتح واتساب مع ملخص التقرير ورابطه.",
  cancelled: "",
  downloaded: "تم حفظ الملف في التنزيلات.",
  copied: "نُسخ الرابط. الصقه في مجموعة الواتساب.",
};

export function ReportShare({ data, autoOpen = false }: { data: ReportData; autoOpen?: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [retry, setRetry] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [check, setCheck] = useState<CheckMeaning>("now");
  const month = new Date(data.generatedAt).getUTCMonth() + 1;
  useEffect(() => {
    if (!autoOpen && window.location.hash !== "#share") return;
    const t = window.setTimeout(() => setOpen(true));
    return () => clearTimeout(t);
  }, [autoOpen]);
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => setCheck(readCheck()));
    return () => clearTimeout(t);
  }, [open]);
  useEffect(() => {
    if (open) prepareReportShare(data, undefined, check);
  }, [open, data, check]);
  const pickCheck = (c: CheckMeaning) => {
    setCheck(c);
    setRetry(null);
    setMsg("");
    safeStorage.setItem(CHECK_KEY, c);
  };

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
      title: "صور التقرير (واتساب)",
      sub: "صفحات التقرير صورًا، تُرسل دفعة واحدة",
      run: () => shareReportImages(data, undefined, { check }),
    },
    {
      key: "pdf",
      icon: I.save(24),
      title: "ملف PDF",
      sub: "التقرير كاملًا في ملف واحد",
      run: () => shareReportPdf(data, undefined, { check }),
    },
    {
      key: "summary",
      icon: I.heart(24),
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
        <button
          type="button"
          className="bq-btn bq-btn-primary bq-btn-lg bq-press"
          onClick={() => setOpen(true)}
        >
          {I.wa(22)} مشاركة التقرير
        </button>
        <button
          type="button"
          className="bq-link bq-link-s bq-link-quiet bq-press"
          onClick={() => window.print()}
        >
          طباعة
        </button>
      </div>
      {open && (
        <Sheet label="مشاركة التقرير" onDone={() => setOpen(false)}>
          <div className="bq-rec">
            <h2>مشاركة التقرير</h2>
            <div className="rp-check">
              <p className="bq-rej-l" id="rp-check-l">
                ✓ يعني:
              </p>
              <div className="bq-chips" role="radiogroup" aria-labelledby="rp-check-l">
                {CHECK_MEANINGS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={check === c}
                    className="bq-chip bq-press"
                    disabled={!!busy}
                    onClick={() => pickCheck(c)}
                  >
                    {CHECK_CHIP[c]}
                  </button>
                ))}
              </div>
              <p className="bq-row-s rp-check-k" aria-label="المفتاح في الصور وملف PDF">
                <span>● مدفوع</span>
                <span>○ غير مدفوع</span>
                <span>✓ {checkLabel(check, month)}</span>
              </p>
            </div>
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
