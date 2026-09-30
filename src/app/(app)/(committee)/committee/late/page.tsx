import { redirect } from "next/navigation";

/** Merged (owner, fewest pages): the members list filter «عليهم متأخرات» and «شارك المتأخرات». */
export default function Gone() {
  redirect("/committee/members?f=owe");
}
