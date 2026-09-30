"use client";
// A report's paper (Lane B's renderers) and its three ways out: «صور لواتساب» · «PDF» · «نص».
// Nothing is claimed about delivery: the share sheet or WhatsApp opens, the person sends.
import { useEffect, useMemo, useState } from "react";
import type { ReportReq, ReportRes } from "@/components/app/source";
import { loadReportData } from "./report-action";
import {
  buildAnnual,
  buildCampaign,
  buildExpenses,
  buildGrid,
  buildHandover,
  buildLate,
  buildStatement,
  buildSummary,
  buildWallets,
  buildWork,
} from "@/lib/reports/build";
import type { DocMeta, ReportDoc } from "@/lib/reports/doc";
import {
  docText,
  prepareReportDoc,
  renderDocPages,
  shareDocImages,
  shareDocPdf,
} from "@/lib/reports/share";
import { copyText } from "@/components/app/copy";
import { Sheet, useP, X } from "./kit";

export function buildDoc(r: ReportRes): ReportDoc {
  switch (r.kind) {
    case "annual":
      return buildAnnual(r.data);
    case "summary":
      return buildSummary(r.data);
    case "grid":
      return buildGrid(r.data);
    case "late":
      return buildLate(r.data);
    case "expenses":
      return buildExpenses(r.data);
    case "campaign":
      return buildCampaign(r.data);
    case "member":
      return buildStatement(r.data);
    case "handover":
      return buildHandover(r.data);
    case "wallets":
      return buildWallets(r.data);
    case "work":
      return buildWork(r.data);
  }
}

/** The report's pages as images (the same pictures that are shared). */
export function DocPreview({ doc, meta }: { doc: ReportDoc; meta: DocMeta }) {
  const [urls, setUrls] = useState<string[] | null>(null);
  useEffect(() => {
    let live = true;
    let made: string[] = [];
    prepareReportDoc(doc, meta);
    renderDocPages(doc, meta)
      .then((blobs) => {
        made = blobs.map((b) => URL.createObjectURL(b));
        if (live) setUrls(made);
        else made.forEach((u) => URL.revokeObjectURL(u));
      })
      .catch(() => live && setUrls([]));
    return () => {
      live = false;
      made.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [doc, meta]);
  if (!urls)
    return (
      <p className="pa-hint" role="status">
        جارٍ تجهيز التقرير…
      </p>
    );
  if (!urls.length)
    return (
      <p className="pa-alert" role="alert">
        تعذّر تجهيز الصور الآن. جرّب «نص».
      </p>
    );
  return (
    <div className="pa-doc">
      {urls.map((u, i) => (
        // eslint-disable-next-line @next/next/no-img-element -- local rendered page
        <img key={u} src={u} alt={`${doc.title}، صفحة ${i + 1} من ${urls.length}`} />
      ))}
    </div>
  );
}

/** «صور لواتساب» · «PDF» · «نص», then one honest line about what happened. */
export function DocShare({ doc, meta }: { doc: ReportDoc; meta: DocMeta }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const run = async (k: string, f: () => Promise<string>) => {
    setBusy(k);
    setMsg("");
    try {
      const r = await f();
      setMsg(
        r === "downloaded"
          ? "حُفظ الملف في التنزيلات."
          : r === "whatsapp"
            ? "فُتح واتساب بنص التقرير. اضغط إرسال هناك."
            : r === "copied"
              ? "نُسخ نص التقرير. الصقه في واتساب."
              : r === "manual"
                ? "لم يُنسخ النص. جرّب «صور لواتساب»."
                : "",
      );
    } catch {
      setMsg("تعذّر تجهيز التقرير الآن. حاول مرة أخرى.");
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="pa-docshare">
      <div className="pa-docshare-b">
        <button
          type="button"
          className="pa-btn pa-btn-primary"
          disabled={!!busy}
          onClick={() => void run("img", () => shareDocImages(doc, meta))}
        >
          {X.image(20)} {busy === "img" ? "جارٍ التجهيز…" : "صور لواتساب"}
        </button>
        <button
          type="button"
          className="pa-btn pa-btn-tonal"
          disabled={!!busy}
          onClick={() => void run("pdf", () => shareDocPdf(doc, meta))}
        >
          {busy === "pdf" ? "جارٍ التجهيز…" : "PDF"}
        </button>
        <button
          type="button"
          className="pa-btn pa-btn-tonal"
          disabled={!!busy}
          onClick={() => void run("txt", () => copyText(docText(doc, meta)))}
        >
          نص
        </button>
      </div>
      <p className="pa-hint">اختر واتساب ثم المجموعة، ثم اضغط إرسال.</p>
      {msg && (
        <p className="pa-hint pa-ok" role="status">
          {msg}
        </p>
      )}
    </div>
  );
}

/** A report in a sheet: loaded when opened, shown as its pages, shared from there. */
export function ReportSheet({
  req,
  title,
  open,
  onClose,
}: {
  req: ReportReq;
  title: string;
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <Sheet open title={title} onClose={onClose}>
      <LoadedReport req={req} />
    </Sheet>
  );
}

/** A report's data, loaded when shown: undefined while loading, null when it failed. */
export function useReport(req: ReportReq): ReportRes | null | undefined {
  const key = JSON.stringify(req);
  const [res, setRes] = useState<{ key: string; r: ReportRes | null } | undefined>();
  useEffect(() => {
    let live = true;
    loadReportData(JSON.parse(key) as ReportReq)
      .then((r) => live && setRes({ key, r }))
      .catch(() => live && setRes({ key, r: null }));
    return () => {
      live = false;
    };
  }, [key]);
  return res && res.key === key ? res.r : undefined;
}

export function useDocMeta(): DocMeta {
  const { d } = useP();
  return useMemo(
    () => ({ generatedAt: new Date().toISOString(), preparedBy: d.me.name }),
    [d.me.name],
  );
}

export function LoadedReport({ req }: { req: ReportReq }) {
  const r = useReport(req);
  const doc = useMemo(() => (r ? buildDoc(r) : null), [r]);
  const meta = useDocMeta();
  if (r === undefined)
    return (
      <p className="pa-hint" role="status">
        جارٍ تحميل التقرير…
      </p>
    );
  if (!doc)
    return (
      <p className="pa-alert" role="alert">
        تعذّر تحميل التقرير. تحقق من الإنترنت ثم حاول مرة أخرى.
      </p>
    );
  return (
    <>
      <DocShare doc={doc} meta={meta} />
      <DocPreview doc={doc} meta={meta} />
    </>
  );
}
