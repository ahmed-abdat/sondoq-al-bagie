"use client";
// «مشاركة التقرير»: one button, one sheet, four big one-tap options. The renderers live in
// src/lib/share-report (Lane B); options whose renderer has not landed yet fall back calmly.
import { useEffect, useState } from "react";
import type { ReportData } from "@/lib/data/types";
import * as sr from "@/lib/share-report";
import { I } from "./icons";
import { Sheet } from "./sheet";

type Result = "shared" | "whatsapp" | "cancelled" | "saved" | "copied";
type Fn = (d: ReportData) => Promise<Result | void>;
// optional renderers (Lane B): used when present
const lib = sr as unknown as Record<string, unknown>;
const opt = (name: string) => (typeof lib[name] === "function" ? (lib[name] as Fn) : null);
const renderPages = opt("renderReportPages") as ((d: ReportData) => Promise<Blob[]>) | null;

const DONE: Record<Result, string> = {
  shared: "أُرسل التقرير.",
  whatsapp: "فُتح واتساب مع ملخص التقرير ورابطه.",
  cancelled: "",
  saved: "حُفظ الملف في هاتفك.",
  copied: "نُسخ الرابط. الصقه في مجموعة الواتساب.",
};

export function ReportShare({ data, autoOpen = false }: { data: ReportData; autoOpen?: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [thumbs, setThumbs] = useState<string[]>([]);
  useEffect(() => {
    if (!autoOpen && window.location.hash !== "#share") return;
    const t = window.setTimeout(() => setOpen(true));
    return () => clearTimeout(t);
  }, [autoOpen]);
  useEffect(() => () => thumbs.forEach((u) => URL.revokeObjectURL(u)), [thumbs]);

  const run = async (key: string, f: () => Promise<Result | void>) => {
    setBusy(key);
    setMsg("");
    try {
      const r = (await f()) ?? "shared";
      setMsg(DONE[r]);
    } catch {
      setMsg("تعذّر تجهيز التقرير الآن. جرّب «نسخ الرابط».");
    } finally {
      setBusy(null);
    }
  };
  const preview = async () => {
    if (!renderPages || thumbs.length) return;
    try {
      const blobs = await renderPages(data);
      setThumbs(blobs.slice(0, 6).map((b) => URL.createObjectURL(b)));
    } catch {
      /* the preview is optional */
    }
  };

  const images = opt("shareReportImages");
  const pdf = opt("shareReportPdf");
  const options = [
    {
      key: "images",
      icon: I.image(24),
      title: "صور التقرير (واتساب)",
      sub: "صفحات التقرير صورًا، تُرسل دفعة واحدة",
      run: async () => {
        void preview();
        return images ? images(data) : sr.shareReportSummary(data);
      },
    },
    {
      key: "pdf",
      icon: I.save(24),
      title: "ملف PDF",
      sub: "التقرير كاملًا في ملف واحد",
      run: async () => {
        if (pdf) return pdf(data);
        window.print();
        return "saved" as const;
      },
    },
    {
      key: "summary",
      icon: I.heart(24),
      title: "صورة الملخص فقط",
      sub: "صورة واحدة: ما في الصندوق ومن دفع",
      run: async () => sr.shareReportSummary(data),
    },
    {
      key: "link",
      icon: I.copy(24),
      title: "نسخ الرابط",
      sub: "يظهر في واتساب ببطاقة فيها الأرقام",
      run: async () => {
        await navigator.clipboard?.writeText(`${window.location.origin}/report`);
        return "copied" as const;
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
                      <span className="bq-row-t">{o.title}</span>
                      <span className="bq-row-s">
                        {busy === o.key ? "جارٍ تجهيز التقرير…" : o.sub}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {thumbs.length > 0 && (
              <div className="rp-thumbs" aria-label="صفحات التقرير">
                {thumbs.map((u, i) => (
                  // eslint-disable-next-line @next/next/no-img-element -- local blob preview
                  <img key={u} src={u} alt={`صفحة ${i + 1}`} />
                ))}
              </div>
            )}
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
