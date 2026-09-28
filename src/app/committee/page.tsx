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
          <button className="border-line bg-surface rounded-full border px-4 py-2 text-sm">
            خروج
          </button>
        </form>
      </header>
      <section className="border-line bg-surface rounded-2xl border p-4">
        <p className="text-muted text-sm">مرحباً</p>
        <p dir="ltr" className="text-end font-medium">
          {user.email}
        </p>
      </section>
      <section className="border-line text-muted rounded-2xl border border-dashed p-4 text-sm">
        تسجيل الدفعات وتأكيدها يأتي في المرحلة 2.
      </section>
    </main>
  );
}
