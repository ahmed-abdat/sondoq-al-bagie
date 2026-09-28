// Arabic labels the data layer writes into reports and CSV exports (same words as the UI).
import type { ExpenseCategory, MembershipStatus, PaymentStatus } from "./types";

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
  deceased: "متوفى",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "بانتظار التأكيد",
  confirmed: "مؤكدة",
  rejected: "مرفوضة",
  cancelled: "ملغاة",
};
