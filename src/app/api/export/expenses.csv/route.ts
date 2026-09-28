import { exportRoute } from "@/lib/data/export";

export const dynamic = "force-dynamic";

/** Committee CSV download (see src/lib/data/csv.ts). */
export const GET = exportRoute("expenses");
