import type { Metadata } from "next";
import { redirect } from "next/navigation";
import * as src from "@/components/app/source";
import { Tab } from "@/components/app/tab";
import { AccountView } from "@/components/app/views/account";

export const metadata: Metadata = { title: "حسابي · صندوق الرابطة" };

export default async function AccountPage() {
  const me = await src.myProfile();
  if (!me) redirect("/login?next=/committee/account");
  const members = await src.memberRows();
  return (
    <Tab>
      <AccountView me={me} members={members} />
    </Tab>
  );
}
