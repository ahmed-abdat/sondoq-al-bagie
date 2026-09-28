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
  "fund_accounts",
  "payments",
  "payment_allocations",
  "payment_months",
  "receipt_counters",
  "expenses",
  "transfers",
  "reminders",
  "audit_log",
] as const satisfies readonly (keyof Database["public"]["Tables"])[];

const PAGE = 1000;
const KEEP = 12; // weekly files kept (about three months)

export type BackupFile = {
  format: "sondoq-backup/1";
  createdAt: string;
  counts: Record<string, number>;
  tables: Record<string, unknown[]>;
};

type Admin = SupabaseClient<Database>;

async function readAll(sb: Admin, table: (typeof BACKUP_TABLES)[number]): Promise<unknown[]> {
  const rows: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from(table)
      .select("*")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`backup ${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

export async function buildBackup(sb: Admin, now = new Date()): Promise<BackupFile> {
  const tables: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};
  for (const t of BACKUP_TABLES) {
    tables[t] = await readAll(sb, t);
    counts[t] = tables[t].length;
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
