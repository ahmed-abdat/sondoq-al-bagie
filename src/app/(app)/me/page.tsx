import type { Metadata } from "next";
import { memberHome } from "@/components/app/member-view-action";
import * as src from "@/components/app/source";
import { Tab } from "@/components/app/tab";
import { MeView } from "@/components/app/views/me";

export const metadata: Metadata = { title: "دفعاتي · صندوق الرابطة" };

// Private: read from the member cookie on every request, never cached or saved offline.
export default async function MePage() {
  const [home, history, info] = await Promise.all([
    memberHome(),
    src.memberHistory(),
    src.fundInfo(),
  ]);
  return (
    <Tab>
      <MeView home={home} history={home ? history : []} whatsapp={info.whatsappContact} />
    </Tab>
  );
}
