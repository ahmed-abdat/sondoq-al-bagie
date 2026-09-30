import { redirect } from "next/navigation";

/** Merged: «عضو جديد» on الأعضاء, «تعديل البيانات» on the member's page. */
export default function Gone() {
  redirect("/committee/members");
}
