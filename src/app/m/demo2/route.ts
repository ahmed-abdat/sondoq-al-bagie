import type { NextRequest } from "next/server";
import { demoLink } from "@/components/app/demo-link";

// Demo only: a second fixture member (B-6) on the same phone, to try /m/switch.
export function GET(request: NextRequest) {
  return demoLink(request, "demo2");
}
