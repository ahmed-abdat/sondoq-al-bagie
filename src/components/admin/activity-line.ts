// «سجل العمليات» lines from the activity log (m29): pure, tested.
import type { ActivityEntry } from "@/lib/data/map";
import { formatNumber as fmt } from "@/lib/format";
import type { PLog } from "./types";

/**
 * One «سجل العمليات» line in plain Arabic: who, what, how much, why. Only what matters to the
 * committee; settings changes are marked (shown to «المسؤول» under «تغييرات الإعدادات»); an
 * action with no Arabic sentence is hidden, never shown as a code.
 */
export function activityLine(x: ActivityEntry): PLog | null {
  const who = x.actorName ?? "عضو في اللجنة";
  const amt = x.amount != null ? ` (${fmt(x.amount)} أوقية)` : "";
  const sub = x.subject ? ` ${x.subject}` : "";
  const why = x.reason ? `. السبب: ${x.reason}` : "";
  const W: Record<string, [string, PLog["kind"]]> = {
    record_payment: [`سجّل دفعة${sub}${amt}`, "pay"],
    // an old payment (recorded before one-level) counted now; the same-moment one is hidden
    confirm_payment: [`سجّل دفعة قديمة${sub}${amt}`, "ok"],
    reject_payment: [`رفض دفعة${sub}${amt}${why}`, "no"],
    cancel_payment: [`ألغى دفعة${sub}${amt}${why}`, "no"],
    undo_payment: [`تراجع عن دفعة${sub}${amt}`, "no"],
    apply_credit: [`دفع من رصيد${sub}${amt}`, "pay"],
    record_expense: [`سجّل مصروفًا${sub}${amt}`, "exp"],
    cancel_expense: [`ألغى مصروفًا${sub}${amt}${why}`, "no"],
    create_campaign: [`فتح تبرعًا:${sub}`, "gift"],
    update_campaign: [`عدّل التبرع${sub}`, "edit"],
    close_campaign: [`أغلق${sub}`, "edit"],
    create_levy: [`أنشأ لوحة${sub}${amt}`, "levy"],
    add_levy_members: [`أضاف أعضاء إلى لوحة${sub}`, "levy"],
    set_levy_share: [`غيّر نصيب${sub}${amt}`, "levy"],
    exempt_levy_share: [`أعفى من لوحة${sub}${why}`, "levy"],
    unexempt_levy_share: [`ألغى إعفاء من لوحة${sub}`, "levy"],
    add_member: [`أضاف عضوًا:${sub}`, "edit"],
    update_member: [`عدّل بيانات${sub}`, "edit"],
    change_member_status: [`غيّر حالة${sub}${why}`, "edit"],
    set_join_month: [`غيّر شهر انضمام${sub}`, "edit"],
    change_member_group: [`نقل${sub} إلى فئة أخرى`, "edit"],
    move_members_to_group: [`نقل أعضاء إلى فئة أخرى${sub}`, "edit"],
    start_handover: ["بدأ تسليم الصندوق", "edit"],
    submit_handover: ["أرسل محضر التسليم", "edit"],
    accept_handover: ["قبل تسليم الصندوق", "edit"],
    cancel_handover: [`ألغى التسليم${why}`, "no"],
  };
  const SETTINGS: Record<string, string> = {
    set_group_price: `غيّر المستحقات الشهرية${sub}${amt}`,
    create_group: `أنشأ فئة${sub}`,
    retire_group: `أوقف فئة${sub}`,
    update_settings: "غيّر الإعدادات",
    add_fund_account: `أضاف محفظة${sub}`,
    update_fund_account: `عدّل محفظة${sub}`,
    deactivate_fund_account: `أوقف المحفظة${sub}`,
    activate_fund_account: `أعاد المحفظة${sub}`,
    create_committee_account: `أضاف حسابًا في اللجنة${sub}`,
    set_committee_member: `عدّل حسابًا في اللجنة${sub}`,
    set_committee_active: `غيّر حالة حساب في اللجنة${sub}`,
  };
  const key = x.action.replaceAll(" ", "_");
  if (W[key]) return { who, what: W[key][0], at: x.at, kind: W[key][1] };
  if (SETTINGS[key]) return { who, what: SETTINGS[key], at: x.at, kind: "edit", settings: true };
  return null;
}

/**
 * The whole log, as the committee reads it. record_payment confirms at once, so the database
 * also writes confirm_payment (on the payment and on its months) in the same transaction: those
 * are the same payment and are hidden, leaving one «سجّل دفعة» line. Rows written by the system
 * (`system`: no actor, e.g. a migration's backfill) are never shown; an actor without a name
 * reads «عضو في اللجنة». Confirmations of the months are never
 * a line of their own.
 */
export function activityLines(xs: ActivityEntry[]): PLog[] {
  const recorded = new Set(
    xs.filter((x) => x.action === "record_payment").map((x) => `${x.at}|${x.rowId}`),
  );
  const recordedAt = new Set(xs.filter((x) => x.action === "record_payment").map((x) => x.at));
  return xs.flatMap((x) => {
    if (x.system === true) return [];
    if (x.action === "confirm_payment") {
      if (x.table !== "payments") return [];
      if (recorded.has(`${x.at}|${x.rowId}`) || recordedAt.has(x.at)) return [];
    }
    return activityLine(x) ?? [];
  });
}
