"use server";
// Money privacy: the only door from the browser to money figures. Checks the committee session
// or the member link on every call (source.money / reportMoney); strangers get null.
import type { CampaignContribution, ReportData } from "@/lib/data/types";
import { toLedger } from "./ledger";
import type { ClientMoney } from "./money-model";
import { fromVerified } from "./receipt-model";
import * as src from "./source";

export async function loadMoney(): Promise<ClientMoney | null> {
  const m = await src.money();
  if (!m) return null;
  const ledger = toLedger(m.activity, m.expenses, src.today());
  // the latest receipts open at once (and offline once seen)
  await Promise.all(
    ledger
      .filter((e) => e.code)
      .slice(0, 20)
      .map(async (e) => {
        e.receipt = fromVerified(await src.receipt(e.code!));
      }),
  );
  return { ...m, ledger };
}

export async function loadReportMoney(): Promise<ReportData | null> {
  return src.reportMoney();
}

export async function loadContributions(
  campaignId: string,
): Promise<CampaignContribution[] | null> {
  return src.moneyContributions(campaignId, 20);
}
