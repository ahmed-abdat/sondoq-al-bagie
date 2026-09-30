// Helpers for the two-person e2e flows (Playwright, Node side only). They talk ONLY to the local
// Supabase started by up.sh: every entry point checks the env first and refuses production.
// Accounts and passwords here are fictional and exist only in the local Docker database.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../src/lib/supabase/database.types";

const ROOT = path.resolve(__dirname, "../../..");
const ENV_FILE = path.join(ROOT, "supabase/tests/e2e/.env.e2e");
const PROD_REF = "vhcdgxgwdlflmxmqnxzf";
export const LOCAL_API = "http://127.0.0.1:55321";

export type E2EEnv = {
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: string;
  SUPABASE_SECRET_KEY: string;
  NEXT_PUBLIC_SITE_URL: string;
  SONDOQ_E2E: string;
  E2E_DB_URL: string;
};

/** Throws unless every value points at the local stack (never the production project). */
export function assertLocalEnv(env: Record<string, string | undefined>): asserts env is E2EEnv {
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (url !== LOCAL_API) throw new Error(`e2e: Supabase URL must be ${LOCAL_API}, got "${url}"`);
  if (!env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || !env.SUPABASE_SECRET_KEY)
    throw new Error("e2e: keys missing (run supabase/tests/e2e/up.sh)");
  if (!/^postgresql:\/\/[^@]+@127\.0\.0\.1:55322\//.test(env.E2E_DB_URL ?? ""))
    throw new Error("e2e: E2E_DB_URL must be the local database");
  if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(env.NEXT_PUBLIC_SITE_URL ?? ""))
    throw new Error("e2e: NEXT_PUBLIC_SITE_URL must be local");
  if (env.SONDOQ_FIXTURES) throw new Error("e2e: SONDOQ_FIXTURES must be unset (real data layer)");
  const all = Object.values(env).join("\n");
  if (all.includes(PROD_REF)) throw new Error("e2e: production project ref found in the env");
}

let cached: E2EEnv | null = null;
/** The env written by up.sh (for the app build/server: spread it into process env). */
export function e2eEnv(): E2EEnv {
  if (cached) return cached;
  let text: string;
  try {
    text = readFileSync(ENV_FILE, "utf8");
  } catch {
    throw new Error("e2e: supabase/tests/e2e/.env.e2e missing (run supabase/tests/e2e/up.sh)");
  }
  const env: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2];
  }
  assertLocalEnv(env);
  return (cached = env);
}

/**
 * Runtime check of the running app: the Supabase URL baked into its client bundle must be the
 * local one, and no chunk may name the production project. Call in globalSetup after the server
 * is up (Next inlines NEXT_PUBLIC_* at build time, so a wrong build is caught here).
 */
export async function assertLocalApp(baseURL: string): Promise<void> {
  const html = await (await fetch(baseURL)).text();
  const chunks = [...new Set(html.match(/\/_next\/static\/[^"'\s]+\.js/g) ?? [])];
  let local = false;
  for (const c of chunks) {
    const js = await (await fetch(new URL(c, baseURL))).text();
    // a real project URL (the SDK itself mentions "*.supabase.co", which is fine)
    if (js.includes(PROD_REF) || /https:\/\/[a-z0-9]{20}\.supabase\.(co|in)/.test(js))
      throw new Error(`e2e: the app bundle ${c} points at a hosted Supabase project`);
    if (js.includes(LOCAL_API)) local = true;
  }
  if (!local) throw new Error("e2e: the app bundle does not use the local Supabase URL");
}

type Admin = SupabaseClient<Database>;
let adminClient: Admin | null = null;
/** Service-role client for setup and assertions (bypasses RLS; local only). */
export function admin(): Admin {
  const env = e2eEnv();
  return (adminClient ??= createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  ));
}

type Res = { data: unknown; error: { message: string } | null };
/** The call's data, or throw (an error or no data). */
function must<R extends Res>(what: string, res: R): NonNullable<R["data"]> {
  if (res.error) throw new Error(`e2e: ${what}: ${res.error.message}`);
  if (res.data == null) throw new Error(`e2e: ${what}: no data`);
  return res.data as NonNullable<R["data"]>;
}
/** Throw on an error (calls that return nothing). */
function ok(what: string, res: Res): void {
  if (res.error) throw new Error(`e2e: ${what}: ${res.error.message}`);
}

/* ───────────── committee accounts ───────────── */

export type Who = "admin" | "treasurer" | "committee";
/** Fixed local accounts made by bootstrap(). Log in on /login with `login` + `password`. */
export const COMMITTEE: Record<Who, { userId: string; login: string; password: string; name: string }> = {
  admin: {
    userId: "00000000-0000-4000-8000-0000000e2e01",
    login: "admin@e2e.invalid",
    password: "e2e-admin-pass-1",
    name: "مدير الاختبار",
  },
  treasurer: {
    userId: "00000000-0000-4000-8000-0000000e2e02",
    login: "treasurer@e2e.invalid",
    password: "e2e-treasurer-pass-1",
    name: "أمين الاختبار",
  },
  committee: {
    userId: "00000000-0000-4000-8000-0000000e2e03",
    login: "committee@e2e.invalid",
    password: "e2e-committee-pass-1",
    name: "مشرف الاختبار",
  },
};

/** Create (or refresh) the three committee accounts: confirmed, setup done, roles set. Idempotent. */
export async function bootstrap(): Promise<void> {
  const a = admin();
  for (const [role, acc] of Object.entries(COMMITTEE) as [Who, (typeof COMMITTEE)[Who]][]) {
    const attrs = {
      email: acc.login,
      password: acc.password,
      email_confirm: true,
      app_metadata: { setup_pending: false },
    };
    const found = await a.auth.admin.getUserById(acc.userId);
    if (found.data.user) must("update user", await a.auth.admin.updateUserById(acc.userId, attrs));
    else must("create user", await a.auth.admin.createUser({ id: acc.userId, ...attrs }));
    ok(
      "set_committee_member",
      await a.rpc("set_committee_member", {
        p_user_id: acc.userId,
        p_display_name: acc.name,
        p_role: role,
      }),
    );
  }
}

/** A supabase-js client signed in as a committee account (for RPCs that need a person). */
export async function signedIn(who: Who): Promise<Admin> {
  const env = e2eEnv();
  const c = createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  must(
    "sign in",
    await c.auth.signInWithPassword({ email: COMMITTEE[who].login, password: COMMITTEE[who].password }),
  );
  return c;
}

/* ───────────── members ───────────── */

/** One untouched member per flow (seed-e2e.sql): list B, group B (500 MRO a month), nothing paid. */
export const E2E_MEMBERS = {
  pay: { ref: "B-901", name: "اختبار الدفع" },
  reject: { ref: "B-902", name: "اختبار الرفض" },
  campaign: { ref: "B-903", name: "اختبار الحملة" },
  cash: { ref: "B-904", name: "اختبار النقد" },
} as const;
/** The open campaign from seed.sql («ترميم المسجد», target 300 000, 70 000 collected by the seed). */
export const E2E_CAMPAIGN_ID = "00000000-0000-4000-8000-00000000ca01";

function parseRef(ref: string) {
  const m = /^([AB])-(\d+)$/.exec(ref);
  if (!m) throw new Error(`e2e: bad member ref ${ref}`);
  return { list: m[1], number: Number(m[2]) };
}

export async function memberId(ref: string): Promise<string> {
  const { list, number } = parseRef(ref);
  const row = must(
    "member",
    await admin().from("members").select("id").eq("list_code", list).eq("number", number).single(),
  );
  return row.id;
}

/** @deprecated member links were retired by m28 (committee-only app); kept so old skipped specs compile. */
export async function memberLink(ref: string, by: Who = "admin"): Promise<string> {
  throw new Error(`e2e: member links are retired (m28); no link for ${ref} (${by})`);
}

/* ───────────── assertions (service role) ───────────── */

export type PaymentRow = {
  id: string;
  status: string;
  amount: number;
  method: string;
  receiptCode: string | null;
  rejectReason: string | null;
  submittedViaLink: boolean;
  createdAt: string;
};

/** Payments touching a member's months or naming them in a campaign allocation, newest first. */
export async function paymentsFor(ref: string): Promise<PaymentRow[]> {
  const id = await memberId(ref);
  const allocs = must(
    "allocations",
    await admin().from("payment_allocations").select("payment_id").eq("member_id", id),
  );
  const ids = [...new Set(allocs.map((a) => a.payment_id))];
  if (!ids.length) return [];
  const rows = must(
    "payments",
    await admin()
      .from("payments")
      .select("id, status, amount, method, receipt_code, reject_reason, submitted_via_link, created_at")
      .in("id", ids)
      .order("created_at", { ascending: false }),
  );
  return rows.map((p) => ({
    id: p.id,
    status: p.status,
    amount: p.amount,
    method: p.method,
    receiptCode: p.receipt_code,
    rejectReason: p.reject_reason,
    submittedViaLink: p.submitted_via_link !== null,
    createdAt: p.created_at,
  }));
}

/** The newest payment for a member, waiting up to `timeoutMs` for one in `status` (if given). */
export async function latestPayment(
  ref: string,
  opts: { status?: string; timeoutMs?: number } = {},
): Promise<PaymentRow> {
  const end = Date.now() + (opts.timeoutMs ?? 10_000);
  for (;;) {
    const [p] = await paymentsFor(ref);
    if (p && (!opts.status || p.status === opts.status)) return p;
    if (Date.now() > end)
      throw new Error(`e2e: no ${opts.status ?? ""} payment for ${ref} (latest: ${p?.status ?? "none"})`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

/** Month states of a member for a year (default: this year), month 1…12 → state. */
export async function monthStates(ref: string, year = new Date().getUTCFullYear()) {
  const rows = must(
    "member_months",
    await admin()
      .from("member_months")
      .select("month, state")
      .eq("member_id", await memberId(ref))
      .eq("year", year),
  );
  return Object.fromEntries(rows.map((r) => [r.month, r.state])) as Record<
    number,
    string
  >;
}

export async function campaignProgress(id = E2E_CAMPAIGN_ID) {
  const r = must(
    "campaign_progress",
    await admin()
      .from("campaign_progress")
      .select("collected, balance, participants_paid, target_amount")
      .eq("campaign_id", id)
      .single(),
  );
  return {
    collected: r.collected ?? 0,
    balance: r.balance ?? 0,
    participantsPaid: r.participants_paid ?? 0,
    targetAmount: r.target_amount,
  };
}

/* ───────────── reset ───────────── */

/** Full reset: `up.sh` (db reset --local: migrations + seeds) then bootstrap(). ~20–40 s. */
export async function resetAll(): Promise<void> {
  execFileSync(path.join(ROOT, "supabase/tests/e2e/up.sh"), { stdio: "inherit", cwd: ROOT });
  cached = null;
  adminClient = null;
  e2eEnv();
  await bootstrap();
}
