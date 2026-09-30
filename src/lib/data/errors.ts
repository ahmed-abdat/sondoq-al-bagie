// Database errors → stable codes → Arabic messages. RPCs raise SQLSTATE P0001 with the code in
// HINT (see supabase/migrations/*_rpc.sql); anything else becomes a generic code. Month errors
// also carry a JSON DETAIL (member, month, price: m17) that fills a more precise message.
import { formatMonth } from "@/lib/dates";
import { formatNumber, ltr } from "@/lib/format";

export const MESSAGES = {
  // input / session
  invalid_input: "تحقق من البيانات المدخلة.",
  not_signed_in: "انتهت الجلسة. سجّل الدخول من جديد.",
  not_configured: "التطبيق غير جاهز الآن. تواصل مع المسؤول.",
  network: "تعذّر الاتصال. تحقق من الإنترنت وحاول مرة أخرى.",
  unknown: "حدث خطأ غير متوقع. حاول مرة أخرى.",
  timeout: "تأخّر الرد. تحقّق من النتيجة قبل المحاولة مرة أخرى.",
  busy: "الخادم مشغول. حاول بعد لحظة.",
  // roles
  not_committee: "هذه العملية لأعضاء اللجنة فقط.",
  not_admin: "هذا الإجراء للمسؤول فقط.",
  not_confirmer: "التأكيد للمسؤول أو أمين الصندوق أو نائبه فقط.",
  not_allowed: "لا تملك صلاحية هذه العملية.",
  own_membership: "دفعة تخص رسومك الشهرية يؤكدها عضو آخر من اللجنة.",
  paper_admin_only: "السجل الورقي يدخله المسؤول فقط.",
  login_taken: "هذا البريد أو الرقم مستخدم لحساب آخر.",
  bad_login: "أدخل بريداً صحيحاً أو رقم هاتف موريتاني من 8 أرقام.",
  not_committee_account: "هذا الحساب ليس من حسابات اللجنة.",
  cannot_reset_self: "غيّر كلمة سرك من صفحة الإعدادات.",
  weak_password: "كلمة السر قصيرة أو ضعيفة (8 أحرف على الأقل).",
  cannot_demote_self: "لا يمكنك سحب صلاحية المسؤول من نفسك.",
  last_admin: "يجب أن يبقى مسؤول واحد على الأقل.",
  cannot_delete_self: "لا يمكنك حذف حسابك.",
  member_link_admin_only: "ربط حسابك بعضو آخر أو إلغاء الربط يتم عند المسؤول.",
  member_not_active: "اختر عضواً نشطاً.",
  member_taken: "هذا العضو مربوط بحساب آخر في اللجنة.",
  member_link_invalid: "هذا الرابط لم يعد يعمل. اطلب رابطًا جديدًا من اللجنة.",
  member_rate_limited: "أرسلت دفعات كثيرة اليوم. انتظر تأكيد اللجنة.",
  proof_required: "أرفق صورة التحويل.",
  member_link_required: "اختر عضويتك: من يؤكد الدفعات يجب أن يكون مربوطًا بعضو.",
  setup_done: "إعداد الحساب مكتمل من قبل.",
  same_password: "اختر كلمة سر غير التي أرسلها المسؤول.",
  has_history: "لهذا الحساب عمليات مسجّلة. أوقفه بدلًا من حذفه ليبقى السجل كاملًا.",
  delete_failed: "حُذف الحساب من اللجنة لكن تعذّر حذف بيانات الدخول. أعد المحاولة لاحقًا.",
  // payments
  not_found: "العنصر غير موجود.",
  not_pending: "هذه الدفعة لم تعد بانتظار التأكيد.",
  month_already_paid: "أحد هذه الأشهر مدفوع من قبل.",
  duplicate_txn_ref: "رقم العملية مسجّل من قبل في دفعة أخرى.",
  duplicate_proof: "صورة الإيصال نفسها مسجّلة من قبل.",
  proof_too_large: "الصورة كبيرة جداً. التقطها من جديد.",
  proof_not_image: "الملف ليس صورة (JPG أو PNG أو WEBP).",
  allocations_required: "اختر الأشهر أو المساهمة التي تغطيها الدفعة.",
  allocations_mismatch: "مجموع التوزيع لا يساوي مبلغ الدفعة.",
  credit_insufficient: "رصيد العضو لا يكفي لهذه الأشهر.",
  future_date: "التاريخ في المستقبل.",
  before_opening: "التاريخ قبل بداية سجلات الصندوق.",
  id_taken: "تعذّر حفظ الدفعة، أعد المحاولة.",
  reason_required: "اكتب السبب.",
  undo_expired: "انتهت مهلة التراجع. ألغِ الدفعة مع ذكر السبب.",
  bad_transition: "لا يمكن تغيير حالة هذه الدفعة بهذه الطريقة.",
  append_only: "لا يمكن تعديل هذا السجل. ألغِه وسجّله من جديد.",
  wrong_month_amount: "مبلغ الشهر لا يساوي الرسوم الشهرية لذلك الشهر. راجع المسؤول.",
  no_price: "لم تُحدَّد رسوم هذه السنة لمجموعة العضو. راجع المسؤول.",
  month_not_owed: "هذا الشهر غير مستحق على العضو: قبل انضمامه، أو بعد إعفائه أو مغادرته.",
  // members / admin
  unknown_group: "المجموعة غير معروفة.",
  group_retired: "هذه الفئة متوقفة من تلك السنة.",
  group_has_members: "في هذه الفئة أعضاء من تلك السنة. انقلهم أولًا.",
  group_name_taken: "يوجد فئة بهذا الاسم.",
  price_frozen: "لا يمكن تغيير رسوم سنة فيها دفعات مسجّلة.",
  member_required: "اختر العضو.",
  number_taken: "هذا الرقم مستخدم في نفس القائمة.",
  unknown_list: "القائمة غير معروفة (أ أو ب).",
  no_open_period: "لا توجد فترة عضوية مفتوحة لهذا العضو.",
  before_current_period: "التاريخ قبل بداية الحالة الحالية.",
  months_already_paid_after: "توجد أشهر مدفوعة بعد هذا التاريخ.",
  months_pending_after: "توجد دفعة بانتظار التأكيد لأشهر بعد هذا التاريخ.",
  no_previous_period: "هذه أول فترة للعضو. صحّح شهر الانضمام بدلًا من التراجع.",
  period_has_payments: "لا يمكن: توجد أشهر مدفوعة أو بانتظار التأكيد في هذه الفترة.",
  join_month_invalid: "شهر الانضمام يجب أن يكون قبل آخر تغيير في حالة العضو.",
  campaign_closed: "هذه الحملة مغلقة.",
  campaign_has_pending: "للحملة مساهمات بانتظار التأكيد. أكّدها أو ارفضها قبل الإغلاق.",
  levy_member_required: "حصة اللوحة تُدفع باسم عضو.",
  not_levy_member: "هذا العضو ليس في هذه اللوحة.",
  levy_exempt: "هذا العضو معفى من هذه اللوحة.",
  levy_full_share: "تُدفع حصة اللوحة كاملة في دفعة واحدة.",
  levy_share_paid: "حصة هذا العضو في اللوحة مدفوعة.",
  handover_in_progress: "يوجد تسليم جارٍ لم يكتمل.",
  handover_not_draft: "لم يعد هذا التسليم قابلاً للتعديل.",
  handover_not_submitted: "لم يُرسل هذا التسليم بعد.",
  handover_confirmed: "هذا التسليم مؤكد ولا يمكن إلغاؤه.",
  counted_required: "أدخل المبالغ الموجودة فعلاً قبل الإرسال.",
  same_person: "يؤكد التسليم مسؤول آخر (المسؤول الجديد).",
  no_open_term: "لا توجد دورة مفتوحة.",
  not_committee_member: "أحد المختارين ليس من أعضاء اللجنة.",
  not_a_wallet: "اختر محفظة (لا نقداً ولا سجلاً ورقياً).",
  account_exists: "هذا الرقم مضاف من قبل لنفس المحفظة.",
} as const satisfies Record<string, string>;

export type ErrorCode = keyof typeof MESSAGES;

/** DETAIL of a month error: {"name", "ref": "A-12", "ym": "2026-07", "price"?} (app_private.month_error). */
type MonthDetail = { name: string; ref?: string; ym: string; price?: number };

function monthDetail(detail: string | null | undefined): MonthDetail | null {
  if (!detail) return null;
  try {
    const d = JSON.parse(detail) as Partial<MonthDetail> | null;
    if (!d || typeof d.name !== "string" || !d.name.trim()) return null;
    if (typeof d.ym !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(d.ym)) return null;
    return {
      name: d.name.trim(),
      ym: d.ym,
      ref: typeof d.ref === "string" && d.ref ? d.ref : undefined,
      price: typeof d.price === "number" && d.price > 0 ? d.price : undefined,
    };
  } catch {
    return null;
  }
}

/** Messages that name the member and month when the database says which one failed. */
const MONTH_TEMPLATES: Partial<
  Record<ErrorCode, (d: MonthDetail, who: string, month: string) => string | null>
> = {
  month_already_paid: (_d, who, month) => `شهر ${month} لـ ${who} مدفوع من قبل.`,
  month_not_owed: (_d, who, month) =>
    `شهر ${month} غير مستحق على ${who}: قبل انضمامه، أو بعد إعفائه أو مغادرته.`,
  wrong_month_amount: (d, who, month) =>
    d.price ? `رسوم شهر ${month} لـ ${who} هي ${formatNumber(d.price)} أوقية.` : null,
};

export function messageFor(code: string, detail?: string | null): string {
  if (!(code in MESSAGES)) return MESSAGES.unknown;
  const template = MONTH_TEMPLATES[code as ErrorCode];
  const d = template ? monthDetail(detail) : null;
  if (template && d) {
    const who = d.ref ? `${d.name} (${ltr(d.ref)})` : d.name;
    const text = template(d, who, formatMonth(d.ym));
    if (text) return text;
  }
  return MESSAGES[code as ErrorCode];
}

type DbError = { code?: string; hint?: string | null; message?: string; details?: string | null };

/** Stable code for a PostgREST / Postgres error. */
export function codeOf(err: DbError): string {
  const hint = err.hint?.trim();
  if (err.code === "P0001" && hint) return hint;
  if (err.code === "23505") {
    const text = `${err.message ?? ""} ${err.details ?? ""}`;
    if (text.includes("payments_txn_ref_uniq")) return "duplicate_txn_ref";
    if (text.includes("payments_proof_hash_uniq")) return "duplicate_proof";
    if (text.includes("payment_months_paid_once")) return "month_already_paid";
    if (text.includes("members_number_key") || text.includes("members_list_number_key"))
      return "number_taken";
    if (text.includes("fund_accounts_active_uniq")) return "account_exists";
    if (text.includes("committee_member_id_key")) return "member_taken";
    if (text.includes("handovers_one_active")) return "handover_in_progress";
  }
  if (err.code === "42501") return "not_committee";
  // bad reference (unknown member/campaign id), missing value, overlapping periods
  if (["22P02", "23514", "22023", "23503", "23502", "23P01"].includes(err.code ?? ""))
    return "invalid_input";
  if (err.code === "57014") return "timeout";
  // serialization failure, deadlock, schema cache reloading after a migration
  if (err.code === "40001" || err.code === "40P01" || err.code === "PGRST202") return "busy";
  if (err.code === "PGRST301" || err.code === "PGRST303") return "not_signed_in";
  if (!err.code && /fetch|network/i.test(err.message ?? "")) return "network";
  return "unknown";
}

/** `detail`: the database error's DETAIL, when it may name a member/month (see messageFor). */
export function failure(code: string, detail?: string | null) {
  return { ok: false as const, code, message: messageFor(code, detail) };
}
