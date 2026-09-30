import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { auditAlertPayload } from "@/lib/push/payload";
import { sendPush } from "@/lib/push/send";
import type { Database } from "@/lib/supabase/database.types";

type Admin = SupabaseClient<Database>;

export type AuditRun = { ok: boolean; total: number; failed: string[] };

/**
 * The daily accuracy check (/api/audit): runs accuracy_audit() (m35) with the server key, records
 * the outcome in job_runs (job 'audit', m36) and, when a check fails, pushes an alert to every
 * active «مسؤول» account. Throws when the audit itself cannot run (the route records that too).
 */
export async function runAuditJob(
  admin: Admin,
  deps: { push?: typeof sendPush; now?: Date } = {},
): Promise<AuditRun> {
  const now = deps.now ?? new Date();
  const { data, error } = await admin.rpc("accuracy_audit");
  if (error) throw new Error(`accuracy_audit: ${error.message}`);
  const rows = data ?? [];
  const failed = rows.filter((r) => r.ok !== true).map((r) => r.check_name);
  // fewer rows than the audit has checks is a failure too (nothing checked = nothing proven)
  const ok = rows.length > 0 && failed.length === 0;
  await recordAuditRun(
    admin,
    { ok, detail: ok ? `${rows.length}/${rows.length}` : failDetail(rows.length, failed) },
    now,
  );
  if (!ok) await alertAdmins(admin, now, deps.push ?? sendPush);
  return { ok, total: rows.length, failed };
}

function failDetail(total: number, failed: string[]): string {
  return (total ? `${failed.length}/${total} failed: ${failed.join("; ")}` : "no checks ran").slice(
    0,
    500,
  );
}

export async function recordAuditRun(
  admin: Admin,
  r: { ok: boolean; detail: string },
  now = new Date(),
) {
  const at = now.toISOString();
  const { error } = await admin
    .from("job_runs")
    .upsert(
      r.ok
        ? { job: "audit", last_run_at: at, ok: true, detail: r.detail, last_ok_at: at }
        : { job: "audit", last_run_at: at, ok: false, detail: r.detail.slice(0, 500) },
      { onConflict: "job" },
    );
  if (error) throw new Error(`audit record: ${error.message}`);
}

async function alertAdmins(admin: Admin, now: Date, push: typeof sendPush) {
  const { data, error } = await admin
    .from("committee")
    .select("user_id")
    .eq("active", true)
    .eq("role", "admin");
  if (error) throw new Error(`audit alert: ${error.message}`);
  // every device of the «مسؤول» accounts, whatever kinds they chose: this is not optional news
  await push(
    (data ?? []).map((r) => r.user_id),
    auditAlertPayload(now.toISOString().slice(0, 10)),
    { admin },
  );
}
