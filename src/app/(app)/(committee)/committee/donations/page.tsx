import { redirect } from "next/navigation";

// Push notifications link here (Lane A): the «التبرعات» tab.
export default function Donations() {
  redirect("/committee/campaigns");
}
