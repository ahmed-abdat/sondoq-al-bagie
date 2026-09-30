import { redirect } from "next/navigation";

// Committee-only app (2026-09-30): the home is the committee's.
export default function Home() {
  redirect("/committee");
}
