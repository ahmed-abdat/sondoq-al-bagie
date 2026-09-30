import { redirect } from "next/navigation";

/** Merged: «سجل العمليات» and each member's كشف حساب. */
export default function Gone() {
  redirect("/committee/activity");
}
