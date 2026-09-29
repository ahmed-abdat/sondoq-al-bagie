import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { ASSOC, memberLabel } from "@/components/app/derive";
import { I } from "@/components/app/icons";
import * as src from "@/components/app/source";
import { MemberSwitchChoice } from "@/components/app/views/member-switch";

export const metadata: Metadata = { title: "رابط شخص آخر · صندوق الرابطة" };

/**
 * A phone already open for one member receives another member's link (family phones, up to 5):
 * ask before switching. Private, per request; nothing to decide → home.
 */
export default async function MemberSwitchPage() {
  const [current, pending] = await Promise.all([src.memberSession(), src.memberPending()]);
  if (!pending || !current) redirect("/");
  const cur = `${current.fullName} (${memberLabel(current)})`;
  const next = `${pending.fullName} (${memberLabel(pending)})`;
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
        <span className="bq-verify-i">{I.people(32)}</span>
        <h1>رابط شخص آخر</h1>
        <div className="bq-switch-who">
          <p className="bq-lead">
            هذا الهاتف مفتوح باسم <bdi>{cur}</bdi>.
          </p>
          <p className="bq-lead">
            هذا رابط <bdi>{next}</bdi>.
          </p>
        </div>
      </section>
      <MemberSwitchChoice current={current.fullName} next={pending.fullName} />
      <p className="bq-hint">لا يضيع شيء: بيانات كل شخص محفوظة عند اللجنة.</p>
    </main>
  );
}
