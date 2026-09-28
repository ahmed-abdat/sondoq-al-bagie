import type { Metadata } from "next";
import * as src from "@/components/app/source";
import { Tab } from "@/components/app/tab";
import { LatePage } from "@/components/app/views/committee";

export const metadata: Metadata = {
  title: "تذكير المتأخرين · صندوق الشباب",
  robots: { index: false },
};

export default async function Late() {
  const [arrears, accounts, info] = await Promise.all([
    src.arrears(),
    src.fundAccounts(),
    src.fundInfo(),
  ]);
  return (
    <Tab>
      <LatePage arrears={arrears} accounts={accounts} whatsapp={info.whatsappContact} />
    </Tab>
  );
}
