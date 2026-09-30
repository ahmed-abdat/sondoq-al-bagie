import type { Metadata } from "next";
import Image from "next/image";
import { ASSOC } from "@/components/app/derive";
import { I } from "@/components/app/icons";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "دخول اللجنة · صندوق الرابطة" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
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
      <section className="bq-gate">
        <span className="bq-gate-i">{I.lock(32)}</span>
        <h1 className="bq-gate-t">ادخل بحسابك لتأكيد الدفعات</h1>
        <p className="bq-hint">أمين الصندوق ونائبه والمشرفون فقط.</p>
      </section>
      <LoginForm next={typeof next === "string" ? next : undefined} />
    </main>
  );
}
