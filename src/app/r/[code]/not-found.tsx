import Image from "next/image";
import Link from "next/link";
import { ASSOC } from "@/components/app/derive";
import { I } from "@/components/app/icons";

/** Unknown receipt code: a real 404, in the app's words. */
export default function ReceiptNotFound() {
  return (
    <main className="bq-verify">
      <header className="bq-verify-h">
        <span className="bq-logo">
          <Image src="/logo.jpg" alt="شعار الرابطة" width={96} height={96} priority />
        </span>
        <span className="bq-brand-t">
          <strong>التحقق من وصل</strong>
          <span>{ASSOC}</span>
        </span>
      </header>
      <section className="bq-verify-s is-none">
        <span className="bq-verify-i">{I.search(32)}</span>
        <h1>لم نجد هذا الوصل</h1>
        <p className="bq-lead">تأكّد من الرمز المكتوب على الوصل، أو اسأل أمين الصندوق.</p>
      </section>
      <Link className="bq-btn bq-btn-soft bq-btn-lg bq-press" href="/">
        افتح صندوق الرابطة
      </Link>
    </main>
  );
}
