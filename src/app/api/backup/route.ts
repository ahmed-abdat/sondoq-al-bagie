import { recordBackupRun, runBackup } from "@/lib/backup/export";
import { pruneOrphanProofs } from "@/lib/backup/orphans";
import { tryCreateAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Weekly Vercel cron (vercel.json, production only): exports every table to one JSON file in the
 * private `backups` bucket and keeps the last 12; the outcome goes to `job_runs` for the committee.
 * Needs CRON_SECRET and SUPABASE_SECRET_KEY.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 401 });
  }
  const admin = tryCreateAdminClient();
  if (!admin) return Response.json({ ok: false, error: "not_configured" }, { status: 503 });
  try {
    const result = await runBackup(admin);
    await recordBackupRun(admin, { ok: true, path: result.path }).catch((err) =>
      console.error("[backup] record", err),
    );
    // housekeeping after a good backup: proof images no record points at (best effort)
    const orphans = await pruneOrphanProofs(admin).catch((err) => {
      console.error("[backup] orphan proofs", err);
      return { removed: 0 };
    });
    return Response.json({ ok: true, ...result, orphanProofsRemoved: orphans.removed });
  } catch (err) {
    console.error("[backup]", err);
    const error = err instanceof Error ? err.message : String(err);
    await recordBackupRun(admin, { ok: false, error }).catch((e) =>
      console.error("[backup] record", e),
    );
    return Response.json({ ok: false, error: "backup_failed" }, { status: 500 });
  }
}
