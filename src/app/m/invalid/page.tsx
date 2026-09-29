import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ASSOC } from "@/components/app/derive";
import { I } from "@/components/app/icons";

export const metadata: Metadata = { title: "رابط لا يعمل · صندوق الرابطة" };

/** A personal link that is wrong, replaced or stopped (the /m/<token> route sends it here). */
export default function MemberLinkInvalid() {
  return (
    <main className="bq-verify">
      <header className="bq-verify-h">
        <span className="bq-logo">
          <Image src="/logo.jpg" alt="شعار الرابطة" width={96} height={96} priority />
        </span>
        <span className="bq-brand-t">
          <strong>صندوق الرابطة</strong>
          <span>{ASSOC}</span>
        </span>
      </header>
      <section className="bq-verify-s is-none">
        <span className="bq-verify-i">{I.lock(32)}</span>
        <h1>هذا الرابط لم يعد يعمل</h1>
        <p className="bq-lead">اطلب رابطًا جديدًا من اللجنة.</p>
      </section>
      <p className="bq-hint">يمكنك رؤية الصندوق والأعضاء بدون رابط.</p>
      <Link className="bq-btn bq-btn-soft bq-btn-lg bq-press" href="/">
        افتح صندوق الرابطة
      </Link>
    </main>
  );
}
