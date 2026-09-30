import { redirect } from "next/navigation";

/** Merged: «تعديل» and «أغلق» on the تبرع's page. */
export default function Gone() {
  redirect("/committee/campaigns");
}
