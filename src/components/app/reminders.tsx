"use client";
// «المتأخرون» (committee-only app, 2026-09-30): the late members inside the app, and one way to
// tell them: «شارك المتأخرات» (images or PDF for the WhatsApp group, names and months only, no
// amounts). No individual WhatsApp reminders and no reminder log (owner, §8).
import { useState } from "react";
import type { Arrear, ReportData } from "@/lib/data/types";
import { shareReminderImages, shareReminderPdf } from "@/lib/share-report";
import { Avatar } from "./bits";
import { fmt, unpaidSince } from "./derive";
import { I } from "./icons";
import { Num } from "./num";

export function LateList({ arrears, report }: { arrears: Arrear[]; report: ReportData | null }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [all, setAll] = useState(false);
  const share = async (k: string, f: () => Promise<string>) => {
    setBusy(k);
    setMsg("");
    try {
      const r = await f();
      setMsg(
        r === "downloaded"
          ? "حُفظ الملف في التنزيلات."
          : r === "whatsapp"
            ? "فُتح واتساب بنص المتأخرات. اضغط إرسال هناك."
            : "",
      );
    } catch {
      setMsg("تعذّر تجهيز المتأخرات الآن. حاول مرة أخرى.");
    } finally {
      setBusy(null);
    }
  };
  if (!arrears.length) return <p className="bq-hint">لا يوجد متأخرون الآن.</p>;
  return (
    <>
      {report && (
        <div className="bq-btn-col">
          <button
            type="button"
            className="bq-btn bq-btn-primary bq-btn-lg bq-press"
            disabled={!!busy}
            onClick={() => void share("img", () => shareReminderImages(report))}
          >
            {I.wa(22)} {busy === "img" ? "جارٍ التجهيز…" : "شارك المتأخرات"}
          </button>
          <button
            type="button"
            className="bq-btn bq-btn-soft bq-press"
            disabled={!!busy}
            onClick={() => void share("pdf", () => shareReminderPdf(report))}
          >
            {I.save(20)} {busy === "pdf" ? "جارٍ التجهيز…" : "ملف PDF"}
          </button>
          <p className="bq-hint">
            الأسماء والأشهر فقط، بلا مبالغ. اختر مجموعة الواتساب ثم اضغط إرسال.
          </p>
          {msg && (
            <p className="bq-save is-saved" role="status">
              {msg}
            </p>
          )}
        </div>
      )}
      <p className="bq-hint bq-list-count">الأكثر تأخرًا أولًا.</p>
      <ul className="bq-list">
        {(all ? arrears : arrears.slice(0, 10)).map((a) => (
          <li key={a.memberId}>
            <div className="bq-row">
              <Avatar m={a} />
              <span className="bq-row-m">
                <span className="bq-row-t">{a.fullName}</span>
                <span className="bq-row-s">
                  {unpaidSince(a.months)} · عليه حتى الآن <Num>{fmt(a.amountOwed)}</Num> أوقية
                </span>
              </span>
            </div>
          </li>
        ))}
      </ul>
      {arrears.length > 10 && (
        <button
          type="button"
          className="bq-link bq-press"
          aria-expanded={all}
          onClick={() => setAll(!all)}
        >
          {all ? "عرض أقل" : `عرض كل المتأخرين (${arrears.length})`} {I.chev(18)}
        </button>
      )}
    </>
  );
}
