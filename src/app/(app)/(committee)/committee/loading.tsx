"use client";
import { usePathname } from "next/navigation";

const TITLES: [RegExp, string][] = [
  [/^\/committee\/?$/, "الرئيسية"],
  [/^\/committee\/record/, "سجّل دفعة"],
  [/^\/committee\/members\/manage/, "إدارة الأعضاء"],
  [/^\/committee\/members\/./, "كشف حساب"],
  [/^\/committee\/members/, "الأعضاء"],
  [/^\/committee\/campaigns/, "التبرعات"],
  [/^\/committee\/stats/, "الإحصاءات"],
  [/^\/committee\/reports/, "التقارير"],
  [/^\/committee\/expenses/, "المصاريف"],
  [/^\/committee\/activity/, "سجل العمليات"],
  [/^\/committee\/late/, "المتأخرون"],
  [/^\/committee\/payments/, "الدفعات الأخيرة"],
  [/^\/committee\/settings/, "الإعدادات"],
  [/^\/committee\/account/, "حسابي"],
  [/^\/committee\/handover/, "تسليم الصندوق"],
];

/** While a page loads: its own title and one short line, then quiet placeholders. */
export default function Loading() {
  const path = usePathname();
  const title = TITLES.find(([re]) => re.test(path))?.[1] ?? "صندوق الرابطة";
  return (
    <div className="pa-page" aria-busy="true">
      <h1>{title}</h1>
      <p className="pa-hint" role="status">
        <span className="bq-spin" aria-hidden="true" /> جارٍ التحميل…
      </p>
      <div className="bq-skel bq-skel-slip" />
      <div className="bq-skel bq-skel-slip" />
    </div>
  );
}
