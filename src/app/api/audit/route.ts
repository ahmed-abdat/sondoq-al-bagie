import { recordAuditRun, runAuditJob } from "@/lib/data/audit-job";
import { tryCreateAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily Vercel cron (vercel.json, production only): the accuracy audit (m35) on the real data.
 * The outcome goes to `job_runs` (job 'audit'); any failed check pushes an alert to the «مسؤول»
 * accounts. Needs CRON_SECRET and SUPABASE_SECRET_KEY (and the VAPID keys for the alert).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 401 });
  }
  const admin = tryCreateAdminClient();
  if (!admin) return Response.json({ ok: false, error: "not_configured" }, { status: 503 });
  try {
    const r = await runAuditJob(admin);
    return Response.json({ ok: r.ok, total: r.total, failed: r.failed.length });
  } catch (err) {
    console.error("[audit]", err);
    const error = err instanceof Error ? err.message : String(err);
    await recordAuditRun(admin, { ok: false, detail: `audit did not run: ${error}` }).catch((e) =>
      console.error("[audit] record", e),
    );
    return Response.json({ ok: false, error: "audit_failed" }, { status: 500 });
  }
}
