import type { Metadata } from "next";
import { ReportView } from "@/components/app/report-view";
import * as src from "@/components/app/source";

// no money in the text of a link preview or of the page itself (money privacy)
export const metadata: Metadata = {
  title: "تقرير الصندوق · صندوق الرابطة",
  description: "من دفع من الأعضاء كل شهر، والمصاريف والحملات.",
  openGraph: {
    title: "تقرير صندوق رابطة شباب البقيع",
    description: "من دفع رسوم هذا الشهر من الأعضاء. افتح التقرير الكامل.",
    type: "article",
    locale: "ar_MR",
    siteName: "صندوق الرابطة",
  },
};

/** Static for everyone: the amount-free shell. Money arrives in the browser (ReportView). */
export default async function ReportPage() {
  const [shell, accounts] = await Promise.all([src.reportShell(), src.fundAccounts()]);
  // the fund's wallets (public, as on /accounts): «ادفع عبر: …» in the fee reminder
  return <ReportView shell={shell} accounts={accounts} />;
}
