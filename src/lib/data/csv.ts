// Committee CSV exports (members with phones, payments, expenses). Pure builders, unit tested;
// the routes under src/app/api/export/ check the committee session and read through RLS.
// Excel-friendly: UTF-8 with BOM (Arabic shows right), commas, CRLF, Western digits, MRO + MRU.
import { mroToMru } from "@/lib/money";
import { METHOD_LABELS, isMethod } from "@/lib/methods";
import { CATEGORY_LABELS, PAYMENT_STATUS_LABELS, STATUS_LABELS } from "./labels";
import type { CampaignProgress, ExpenseAdmin, MemberAdmin, PendingPayment } from "./types";

type Cell = string | number | null | undefined;

/** Free text typed by people: a leading = + - @ would run as a formula in Excel. */
function text(v: string | null | undefined): string {
  if (!v) return "";
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

function cell(v: Cell): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: Cell[][]): string {
  return "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

/** "2026-09-28 14:05" (UTC = Nouakchott time), "" for null. */
function stamp(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 16).replace("T", " ") : "";
}

const mru = (mro: number) => mroToMru(mro);

export function membersCsv(members: MemberAdmin[]): string {
  return toCsv(
    [
      "رقم العضو",
      "القائمة",
      "الرقم",
      "الاسم",
      "الهاتف",
      "المجموعة",
      "الحالة",
      "أشهر مدفوعة هذا العام",
      "أشهر متأخرة",
      "المستحق (أوقية)",
      "المستحق (أوقية جديدة)",
      "أول شهر",
      "ملاحظة",
    ],
    members.map((m) => [
      m.memberRef,
      m.listCode,
      m.number,
      text(m.fullName),
      m.phone ?? "",
      m.groupCode,
      STATUS_LABELS[m.status],
      m.monthsPaidThisYear,
      m.monthsBehind,
      m.amountOwed,
      mru(m.amountOwed),
      m.joinedMonth?.slice(0, 7) ?? "",
      text(m.note),
    ]),
  );
}

export function paymentsCsv(payments: PendingPayment[], campaigns: CampaignProgress[]): string {
  const title = new Map(campaigns.map((c) => [c.campaignId, c.title]));
  return toCsv(
    [
      "رقم الإيصال",
      "رمز الإيصال",
      "تاريخ الدفع",
      "الدافع",
      "الطريقة",
      "المبلغ (أوقية)",
      "المبلغ (أوقية جديدة)",
      "الحالة",
      "الأعضاء",
      "الأشهر",
      "التبرعات",
      "رصيد لعضو (أوقية)",
      "رقم العملية",
      "سجّلها",
      "وقت التسجيل",
      "قرّرها",
      "وقت القرار",
      "سبب الرفض أو الإلغاء",
      "ملاحظة",
    ],
    payments.map((p) => {
      const refs = new Map<string, string>();
      const months = new Map<string, string[]>();
      const gifts: string[] = [];
      let credit = 0;
      for (const a of p.allocations) {
        if (a.kind === "campaign") {
          gifts.push(`${title.get(a.campaignId) ?? "حملة"}: ${a.amount}`);
          continue;
        }
        const ref = `${a.listCode}-${a.number}`;
        refs.set(ref, `${ref} ${a.fullName}`);
        if (a.kind === "credit") credit += a.amount;
        else {
          const list = months.get(ref) ?? [];
          list.push(`${a.year}-${String(a.month).padStart(2, "0")}`);
          months.set(ref, list);
        }
      }
      return [
        p.receiptNo ?? "",
        p.receiptCode ?? "",
        p.paidOn,
        text(p.payerName),
        isMethod(p.method) ? METHOD_LABELS[p.method] : p.method,
        p.amount,
        mru(p.amount),
        PAYMENT_STATUS_LABELS[p.status],
        text([...refs.values()].join(" | ")),
        [...months].map(([ref, ms]) => `${ref}: ${ms.join(" ")}`).join(" | "),
        text(gifts.join(" | ")),
        credit || "",
        text(p.txnRef),
        text(p.createdByName),
        stamp(p.createdAt),
        text(p.decidedByName),
        stamp(p.decidedAt),
        text(p.rejectReason ?? p.cancelReason),
        text(p.note),
      ];
    }),
  );
}

export function expensesCsv(expenses: ExpenseAdmin[], campaigns: CampaignProgress[]): string {
  const title = new Map(campaigns.map((c) => [c.campaignId, c.title]));
  return toCsv(
    [
      "التاريخ",
      "الفئة",
      "المبلغ (أوقية)",
      "المبلغ (أوقية جديدة)",
      "ملاحظة",
      "الحملة",
      "الحالة",
      "سبب الإلغاء",
      "وقت التسجيل",
    ],
    expenses.map((e) => [
      e.spentOn,
      CATEGORY_LABELS[e.category],
      e.amount,
      mru(e.amount),
      text(e.note),
      e.campaignId ? text(title.get(e.campaignId) ?? "") : "",
      e.cancelledAt ? "ملغاة" : "نافذة",
      text(e.cancelReason),
      stamp(e.createdAt),
    ]),
  );
}
