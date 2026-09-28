import Link from "next/link";
import { Brand } from "@/components/brand";

// الصفحة العامة: يراها كل الأعضاء بلا تسجيل دخول.
// الأرقام تُربط بقاعدة البيانات في المرحلة 3.
const stats = [
  { label: "رصيد الصندوق", hint: "بعد ربط البيانات" },
  { label: "المحصَّل هذا الشهر", hint: "بعد ربط البيانات" },
  { label: "الأعضاء المنتظمون", hint: "بعد ربط البيانات" },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 py-6">
      <header className="flex items-center justify-between">
        <Brand subtitle="رابطة شباب قرية البقيع" />
        <Link
          href="/committee"
          className="border-line bg-surface rounded-full border px-4 py-2 text-sm font-medium"
        >
          دخول اللجنة
        </Link>
      </header>

      <section className="bg-primary text-primary-ink rounded-3xl p-5 shadow-sm">
        <p className="text-sm opacity-90">{stats[0].label}</p>
        <p className="num font-display mt-1 text-4xl font-bold">—</p>
        <p className="mt-2 text-sm opacity-80">{stats[0].hint}</p>
      </section>

      <section className="grid grid-cols-2 gap-3">
        {stats.slice(1).map((s) => (
          <div key={s.label} className="border-line bg-surface rounded-2xl border p-4">
            <p className="text-muted text-sm">{s.label}</p>
            <p className="num mt-1 text-2xl font-bold">—</p>
          </div>
        ))}
      </section>

      <section className="border-line bg-surface rounded-2xl border p-4">
        <h2 className="font-display text-base font-bold">آخر النشاطات</h2>
        <p className="text-muted mt-2 text-sm">
          ستظهر هنا الدفعات المؤكدة والمصاريف فور تشغيل قاعدة البيانات.
        </p>
      </section>
    </main>
  );
}
