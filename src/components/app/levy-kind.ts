// A لوحة or a تبرع (QA pass 9 P0-2). The database says it with `kind`; the committee read of
// campaigns does not carry it yet, so: a campaign with levy shares, or a fixed / per-group amount
// (only a لوحة has those), is a لوحة — never only «fixed» (a two-price لوحة is «per_group»).
import type { CampaignMode } from "@/lib/data/types";

export function isLevy(
  c: { campaignId: string; amountMode: CampaignMode; kind?: "donation" | "levy" | null },
  shareCampaigns: ReadonlySet<string>,
): boolean {
  if (c.kind) return c.kind === "levy";
  return (
    shareCampaigns.has(c.campaignId) || c.amountMode === "fixed" || c.amountMode === "per_group"
  );
}
