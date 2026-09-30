import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "لم نجد هذه الصفحة · صندوق الرابطة" };

/** Any unknown address: plain Arabic and one way back. */
export default function NotFound() {
  return (
    <main className="bq-sec bq-sec-first" dir="rtl">
      <div className="bq-empty">
        <p className="bq-empty-t">لم نجد هذه الصفحة</p>
        <p className="bq-hint">ربما تغيّر عنوانها أو حُذفت.</p>
        <Link href="/committee" className="bq-btn bq-btn-soft bq-press">
          إلى الرئيسية
        </Link>
      </div>
    </main>
  );
}
