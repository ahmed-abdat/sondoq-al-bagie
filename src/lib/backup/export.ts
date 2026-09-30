import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/** Every table in the schema, in restore order (parents first). */
export const BACKUP_TABLES = [
  "settings",
  "groups",
  "group_prices",
  "members",
  "membership_periods",
  "committee",
  "campaigns",
  "campaign_participants",
  "wallet_types",
  "fund_accounts",
  "payments",
  "payment_allocations",
  "payment_months",
  "receipt_counters",
  "expense_activities",
  "expenses",
  "transfers",
  "wallet_transfers",
  "reminders",
  "terms",
  "handovers",
  "balance_adjustments",
  "audit_log",
] as const satisfies readonly (keyof Database["public"]["Tables"])[];

const KEEP = 12; // weekly files kept (about three months)

export type BackupFile = {
  format: "sondoq-backup/1";
  createdAt: string;
  counts: Record<string, number>;
  tables: Record<string, unknown[]>;
};

type Admin = SupabaseClient<Database>;

/** Every table read in one database snapshot (`backup_snapshot`, service role only). */
export async function buildBackup(sb: Admin, now = new Date()): Promise<BackupFile> {
  const { data, error } = await sb.rpc("backup_snapshot", { p_tables: [...BACKUP_TABLES] });
  if (error) throw new Error(`backup snapshot: ${error.message}`);
  const snap = (data ?? {}) as Record<string, unknown[] | undefined>;
  const tables: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};
  for (const t of BACKUP_TABLES) {
    const rows = snap[t];
    if (!Array.isArray(rows)) throw new Error(`backup snapshot: ${t} missing`);
    tables[t] = rows;
    counts[t] = rows.length;
  }
  return { format: "sondoq-backup/1", createdAt: now.toISOString(), counts, tables };
}

/** backups/2026/2026-09-28.json */
export function backupPath(now: Date): string {
  const day = now.toISOString().slice(0, 10);
  return `${day.slice(0, 4)}/${day}.json`;
}

/** Oldest files beyond the newest `keep`, given all names (YYYY/YYYY-MM-DD.json). Pure. */
export function filesToPrune(paths: string[], keep = KEEP): string[] {
  return [...paths].sort().reverse().slice(keep);
}

/** Writes today's backup to the private `backups` bucket and prunes old ones. */
export async function runBackup(sb: Admin, now = new Date()) {
  const file = await buildBackup(sb, now);
  const path = backupPath(now);
  const body = new Blob([JSON.stringify(file)], { type: "application/json" });
  const up = await sb.storage
    .from("backups")
    .upload(path, body, { contentType: "application/json", upsert: true });
  if (up.error) throw new Error(`backup upload: ${up.error.message}`);

  const years = await sb.storage.from("backups").list("", { limit: 100 });
  const all: string[] = [];
  for (const y of years.data ?? []) {
    const files = await sb.storage.from("backups").list(y.name, { limit: 1000 });
    all.push(
      ...(files.data ?? [])
        .filter((f) => f.name.endsWith(".json"))
        .map((f) => `${y.name}/${f.name}`),
    );
  }
  const prune = filesToPrune(all);
  if (prune.length) await sb.storage.from("backups").remove(prune);
  return { path, counts: file.counts, pruned: prune.length };
}

/** "2026/2026-09-28.json · صور إثبات بلا سجل: 2 (payments/…, …)" — at most 3 paths shown. */
export function okDetail(path: string, orphans?: { count: number; paths: string[] }): string {
  if (!orphans?.count) return path;
  const shown = orphans.paths.slice(0, 3).join("، ");
  const more = orphans.count > 3 ? "، …" : "";
  return `${path} · صور إثبات بلا سجل: ${orphans.count} (${shown}${more})`;
}

/**
 * Stores the outcome of a backup run in `job_runs` (read by the committee settings). `last_ok_at`
 * is only written on success, so a failure keeps the date of the last good file.
 */
export async function recordBackupRun(
  sb: Admin,
  r:
    | { ok: true; path: string; orphans?: { count: number; paths: string[] } }
    | { ok: false; error: string },
  now = new Date(),
) {
  const at = now.toISOString();
  const row: Database["public"]["Tables"]["job_runs"]["Insert"] = r.ok
    ? {
        job: "backup",
        last_run_at: at,
        ok: true,
        detail: okDetail(r.path, r.orphans),
        last_ok_at: at,
      }
    : { job: "backup", last_run_at: at, ok: false, detail: r.error.slice(0, 200) };
  const { error } = await sb.from("job_runs").upsert(row, { onConflict: "job" });
  if (error) throw new Error(`backup record: ${error.message}`);
}
