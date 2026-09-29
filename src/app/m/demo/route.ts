import type { NextRequest } from "next/server";
import { demoLink } from "@/components/app/demo-link";

// Demo only (fixtures, never production): opens the app as the fixture member A-3, like a real
// personal link would. The real /m/<token> route (Lane B) has no demo branch.
export function GET(request: NextRequest) {
  return demoLink(request, "demo");
}
