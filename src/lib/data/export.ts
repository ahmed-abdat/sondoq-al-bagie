import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getCommitteeSession } from "./committee";
import { expensesCsv, membersCsv, paymentsCsv } from "./csv";
import * as read from "./read";

type Build = (c: read.Client) => Promise<string>;

export const EXPORTS = {
  members: async (c) => membersCsv(await read.membersAdmin(c)),
  payments: async (c) => {
    const [payments, campaigns] = await Promise.all([read.allPayments(c), read.campaigns(c)]);
    return paymentsCsv(payments, campaigns);
  },
  expenses: async (c) => {
    const [expenses, campaigns] = await Promise.all([read.allExpenses(c), read.campaigns(c)]);
    return expensesCsv(expenses, campaigns);
  },
} satisfies Record<string, Build>;

/**
 * GET handler of /api/export/<name>.csv: active committee members only (401 otherwise), rows
 * read through RLS with the caller's session, never cached.
 */
export function exportRoute(name: keyof typeof EXPORTS) {
  return async function GET(): Promise<Response> {
    const session = await getCommitteeSession();
    const c = session ? await createClient() : null;
    if (!session || !c) {
      return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    try {
      const body = await EXPORTS[name](c);
      const day = new Date().toISOString().slice(0, 10);
      return new Response(body, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="${name}-${day}.csv"`,
          "cache-control": "private, no-store",
        },
      });
    } catch (err) {
      console.error(`[export ${name}]`, err);
      return Response.json({ ok: false, error: "export_failed" }, { status: 500 });
    }
  };
}
