import { Brand } from "@/components/brand";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-4">
      <Brand subtitle="دخول أعضاء اللجنة" />
      <div className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
        <LoginForm next={typeof next === "string" ? next : undefined} />
      </div>
      <p className="text-center text-sm text-muted">
        الأعضاء لا يحتاجون حساباً، الصفحة العامة مفتوحة للجميع.
      </p>
    </main>
  );
}
