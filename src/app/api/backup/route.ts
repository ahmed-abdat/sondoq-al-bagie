import { runBackup } from "@/lib/backup/export";
import { tryCreateAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Weekly Vercel cron (vercel.json, production only): exports every table to one JSON file in the
 * private `backups` bucket and keeps the last 12. Needs CRON_SECRET and SUPABASE_SECRET_KEY.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 401 });
  }
  const admin = tryCreateAdminClient();
  if (!admin) return Response.json({ ok: false, error: "not_configured" }, { status: 503 });
  try {
    return Response.json({ ok: true, ...(await runBackup(admin)) });
  } catch (err) {
    console.error("[backup]", err);
    return Response.json({ ok: false, error: "backup_failed" }, { status: 500 });
  }
}
