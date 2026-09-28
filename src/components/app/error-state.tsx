"use client";
import { useEffect } from "react";
import { useOnline } from "@/components/providers";
import { I } from "./icons";

/** Calm fallback for a failed page (network, database): what happened and one way out. */
export function ErrorState({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const online = useOnline();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <section className="bq-sec bq-sec-first" role="alert">
      <div className="bq-empty">
        <span className="bq-disc">{online ? I.clock(22) : I.ban(22)}</span>
        <p className="bq-empty-t">
          {online ? "تعذّر تحميل هذه الصفحة الآن" : "لا يوجد اتصال بالإنترنت"}
        </p>
        <p className="bq-hint">
          {online
            ? "قد يكون الخادم مشغولًا. حاول مرة أخرى بعد لحظة."
            : "اتصل بالإنترنت ثم حاول مرة أخرى."}
        </p>
        <button type="button" className="bq-btn bq-btn-soft bq-press" onClick={() => retry()}>
          حاول مرة أخرى
        </button>
      </div>
    </section>
  );
}
