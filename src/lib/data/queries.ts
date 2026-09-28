"use client";
// TanStack Query option factories for Client Components. They read through the browser client,
// so public view GETs go through the service worker cache. Keys start with "public" (saved on
// the phone for offline) or "committee" (memory only).
import { queryOptions } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import * as read from "./read";
import { COMMITTEE_KEY, PUBLIC_KEY } from "./tags";

let browser: read.Client | null = null;
const client = () => (browser ??= createClient());

export const publicQueries = {
  all: () => [PUBLIC_KEY] as const,
  fundSummary: () =>
    queryOptions({
      queryKey: [PUBLIC_KEY, "fund_summary"],
      queryFn: () => read.fundSummary(client()),
    }),
  groupPrices: (year: number) =>
    queryOptions({
      queryKey: [PUBLIC_KEY, "group_prices", year],
      queryFn: () => read.groupPrices(client(), year),
    }),
  members: () =>
    queryOptions({
      queryKey: [PUBLIC_KEY, "member_status"],
      queryFn: () => read.members(client()),
    }),
  lateMembers: () =>
    queryOptions({
      queryKey: [PUBLIC_KEY, "late_members"],
      queryFn: () => read.lateMembers(client()),
    }),
  memberMonths: (year: number) =>
    queryOptions({
      queryKey: [PUBLIC_KEY, "member_months", year],
      queryFn: () => read.memberMonths(client(), year),
    }),
  memberMonthsOf: (memberId: string) =>
    queryOptions({
      queryKey: [PUBLIC_KEY, "member_months", "member", memberId],
      queryFn: () => read.memberMonthsOf(client(), memberId),
    }),
  monthlyCollection: (year: number) =>
    queryOptions({
      queryKey: [PUBLIC_KEY, "monthly_collection", year],
      queryFn: () => read.monthlyCollection(client(), year),
    }),
  expenseTotals: () =>
    queryOptions({
      queryKey: [PUBLIC_KEY, "expense_totals"],
      queryFn: () => read.expenseTotals(client()),
    }),
  recentExpenses: () =>
    queryOptions({
      queryKey: [PUBLIC_KEY, "recent_expenses"],
      queryFn: () => read.recentExpenses(client()),
    }),
  campaigns: () =>
    queryOptions({
      queryKey: [PUBLIC_KEY, "campaign_progress"],
      queryFn: () => read.campaigns(client()),
    }),
  activity: () =>
    queryOptions({
      queryKey: [PUBLIC_KEY, "activity_feed"],
      queryFn: () => read.activity(client()),
    }),
  campaignContributions: (campaignId: string, limit = 20) =>
    queryOptions({
      queryKey: [PUBLIC_KEY, "campaign_contributions", campaignId, limit],
      queryFn: () => read.campaignContributions(client(), campaignId, limit),
    }),
  receipt: (code: string) =>
    queryOptions({
      queryKey: [PUBLIC_KEY, "receipt", code.trim().toUpperCase()],
      queryFn: () => read.verifyReceipt(client(), code),
    }),
  fundAccounts: () =>
    queryOptions({
      queryKey: [PUBLIC_KEY, "fund_accounts"],
      queryFn: () => read.fundAccounts(client()),
    }),
  fundInfo: () =>
    queryOptions({ queryKey: [PUBLIC_KEY, "fund_info"], queryFn: () => read.fundInfo(client()) }),
};

export const committeeQueries = {
  all: () => [COMMITTEE_KEY] as const,
  pendingPayments: () =>
    queryOptions({
      queryKey: [COMMITTEE_KEY, "payments", "pending"],
      queryFn: () => read.pendingPayments(client()),
    }),
  recentPayments: (limit = 50) =>
    queryOptions({
      queryKey: [COMMITTEE_KEY, "payments", "recent", limit],
      queryFn: () => read.recentPayments(client(), limit),
    }),
  payment: (id: string) =>
    queryOptions({
      queryKey: [COMMITTEE_KEY, "payments", "one", id],
      queryFn: () => read.paymentById(client(), id),
    }),
  arrears: () =>
    queryOptions({ queryKey: [COMMITTEE_KEY, "arrears"], queryFn: () => read.arrears(client()) }),
  expenses: (limit = 100) =>
    queryOptions({
      queryKey: [COMMITTEE_KEY, "expenses", limit],
      queryFn: () => read.expensesAdmin(client(), limit),
    }),
  fundAccounts: () =>
    queryOptions({
      queryKey: [COMMITTEE_KEY, "fund_accounts"],
      queryFn: () => read.fundAccountsAdmin(client()),
    }),
};
