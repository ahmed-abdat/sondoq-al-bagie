// Arabic labels the data layer writes into reports (same words as the UI).
import type { ExpenseCategory, MembershipStatus } from "./types";

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  teaching: "التدريس",
  honoring: "التكريم",
  sports: "الرياضة",
  other: "أخرى",
};

export const STATUS_LABELS: Record<MembershipStatus, string> = {
  active: "نشط",
  exempt: "معفى",
  away: "مسافر",
  left: "غادر",
  // not offered any more (owner decision); kept for the enum
  deceased: "متوفى",
};
