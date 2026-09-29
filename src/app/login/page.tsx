import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ASSOC } from "@/components/app/derive";
import { I } from "@/components/app/icons";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "دخول اللجنة · صندوق الشباب" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  return (
    <main className="bq-verify">
      <header className="bq-verify-h">
        <span className="bq-logo">
          <Image src="/logo.jpg" alt="شعار الرابطة" width={96} height={96} priority />
        </span>
        <span className="bq-brand-t">
          <strong>صندوق الشباب</strong>
          <span>{ASSOC}</span>
        </span>
      </header>
      <section className="bq-gate">
        <span className="bq-gate-i">{I.lock(32)}</span>
        <h1 className="bq-gate-t">ادخل بحسابك لتأكيد الدفعات</h1>
        <p className="bq-hint">
          أمين الصندوق ونائبه والمشرفون فقط. الأعضاء يرون كل شيء في الصفحة العامة.
        </p>
      </section>
      <LoginForm next={typeof next === "string" ? next : undefined} />
      <Link className="bq-btn bq-btn-ghost bq-press" href="/">
        {I.home(20)} الصفحة العامة
      </Link>
    </main>
  );
}
