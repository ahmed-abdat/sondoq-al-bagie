import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { createClient } from "@/lib/supabase/server";
import { logout } from "../login/actions";

export default async function CommitteeHome() {
  const supabase = await createClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user) redirect("/login");

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 py-6">
      <header className="flex items-center justify-between">
        <Brand subtitle="لوحة اللجنة" />
        <form action={logout}>
          <button className="rounded-full border border-line bg-surface px-4 py-2 text-sm">
            خروج
          </button>
        </form>
      </header>
      <section className="rounded-2xl border border-line bg-surface p-4">
        <p className="text-sm text-muted">مرحباً</p>
        <p dir="ltr" className="text-end font-medium">
          {user.email}
        </p>
      </section>
      <section className="rounded-2xl border border-dashed border-line p-4 text-sm text-muted">
        تسجيل الدفعات وتأكيدها يأتي في المرحلة 2.
      </section>
    </main>
  );
}
