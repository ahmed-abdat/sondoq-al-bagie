import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { isProofPath } from "@/lib/data/proof";

// Proof images whose record never got saved (the upload worked, record_payment/record_expense
// failed or the phone gave up) stay in the private `proofs` bucket. Weekly, after the backup, the
// job REPORTS files older than a day that no payment or expense points at (count + a few paths in
// job_runs). It deletes nothing: proof images are evidence, and removing them needs the owner's
// explicit OK (then: delete only files older than 30 days).

type Admin = SupabaseClient<Database>;

const PAGE = 1000;
const MIN_AGE_MS = 24 * 60 * 60 * 1000; // a record may still be on its way for a fresh upload

type Listed = { name: string; created_at?: string | null };

/** Paths old enough to judge. Pure (unit tested). */
export function candidates(folder: string, files: Listed[], now: Date): string[] {
  return files
    .filter((f) => f.created_at && now.getTime() - Date.parse(f.created_at) > MIN_AGE_MS)
    .map((f) => `${folder}/${f.name}`)
    .filter(isProofPath);
}

async function listAll(sb: Admin, folder: string): Promise<Listed[]> {
  const out: Listed[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await sb.storage
      .from("proofs")
      .list(folder, { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`proofs list ${folder}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

/** Paths among `paths` that a record points at. */
async function referenced(sb: Admin, folder: string, paths: string[]): Promise<Set<string>> {
  const used = new Set<string>();
  for (let i = 0; i < paths.length; i += 200) {
    const chunk = paths.slice(i, i + 200);
    const res =
      folder === "payments"
        ? await sb.from("payments").select("proof_path").in("proof_path", chunk)
        : await sb.from("expenses").select("receipt_path").in("receipt_path", chunk);
    if (res.error) throw new Error(`proofs refs ${folder}: ${res.error.message}`);
    for (const r of (res.data ?? []) as {
      proof_path?: string | null;
      receipt_path?: string | null;
    }[]) {
      const p = r.proof_path ?? r.receipt_path;
      if (p) used.add(p);
    }
  }
  return used;
}

/** Orphan proof paths (report only; nothing is deleted). */
export async function findOrphanProofs(sb: Admin, now = new Date()) {
  const orphans: string[] = [];
  for (const folder of ["payments", "expenses"] as const) {
    const old = candidates(folder, await listAll(sb, folder), now);
    if (!old.length) continue;
    const used = await referenced(sb, folder, old);
    orphans.push(...old.filter((p) => !used.has(p)));
  }
  return { count: orphans.length, paths: orphans };
}
