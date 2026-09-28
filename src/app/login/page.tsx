import { Brand } from "@/components/brand";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-4">
      <Brand subtitle="دخول أعضاء اللجنة" />
      <div className="border-line bg-surface rounded-3xl border p-5 shadow-sm">
        <LoginForm next={typeof next === "string" ? next : undefined} />
      </div>
      <p className="text-muted text-center text-sm">
        الأعضاء لا يحتاجون حساباً، الصفحة العامة مفتوحة للجميع.
      </p>
    </main>
  );
}
