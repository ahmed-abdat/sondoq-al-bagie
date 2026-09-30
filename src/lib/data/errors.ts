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
  not_confirmer: "هذه العملية لأعضاء اللجنة فقط.",
  not_allowed: "لا تملك صلاحية هذه العملية.",
  own_membership: "هذه الدفعة يسجّلها عضو آخر من اللجنة.",
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
  member_link_required: "اختر اسمك من قائمة الأعضاء.",
  setup_done: "إعداد الحساب مكتمل من قبل.",
  same_password: "اختر كلمة سر غير التي أرسلها المسؤول.",
  has_history: "لهذا الحساب عمليات مسجّلة. أوقفه بدلًا من حذفه ليبقى السجل كاملًا.",
  delete_failed: "حُذف الحساب من اللجنة لكن تعذّر حذف بيانات الدخول. أعد المحاولة لاحقًا.",
  // payments
  not_found: "العنصر غير موجود.",
  not_pending: "هذه الدفعة لم تعد معلّقة.",
  month_already_paid: "أحد هذه الأشهر مدفوع من قبل.",
  duplicate_txn_ref: "رقم العملية مسجّل من قبل في دفعة أخرى.",
  duplicate_proof: "صورة التحويل نفسها مسجّلة من قبل.",
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
  wrong_month_amount: "مبلغ الشهر لا يساوي المستحقات الشهرية لذلك الشهر. راجع المسؤول.",
  no_price: "لم تُحدَّد المستحقات الشهرية لفئة العضو في هذه السنة. راجع المسؤول.",
  month_not_owed: "هذا الشهر غير مستحق على العضو: قبل انضمامه، أو بعد إعفائه أو مغادرته.",
  // members / admin
  unknown_group: "الفئة غير معروفة.",
  group_retired: "هذه الفئة متوقفة من تلك السنة.",
  group_has_members: "في هذه الفئة أعضاء من تلك السنة. انقلهم أولًا.",
  group_name_taken: "يوجد فئة بهذا الاسم.",
  activity_name_taken: "يوجد نشاط بهذا الاسم.",
  activity_retired: "هذا النشاط متوقف. اختر نشاطًا آخر.",
  last_activity: "لا يمكن إيقاف آخر نشاط.",
  wallet_mismatch: "الحساب المختار ليس من هذه المحفظة.",
  wallet_inactive: "هذه المحفظة متوقفة. اختر محفظة أخرى.",
  opening_already_set: "رصيد أول المحفظة محدد من قبل.",
  wallet_name_taken: "توجد محفظة بهذا الاسم.",
  last_wallet: "لا يمكن إيقاف آخر محفظة.",
  price_frozen: "لا يمكن تغيير المستحقات الشهرية لسنة فيها دفعات مسجّلة.",
  member_required: "اختر العضو.",
  number_taken: "هذا الرقم مستخدم في نفس القائمة.",
  unknown_list: "القائمة غير معروفة (أ أو ب).",
  no_open_period: "لا توجد فترة عضوية مفتوحة لهذا العضو.",
  before_current_period: "التاريخ قبل بداية الحالة الحالية.",
  months_already_paid_after: "توجد أشهر مدفوعة بعد هذا التاريخ.",
  months_pending_after: "توجد دفعة معلّقة لأشهر بعد هذا التاريخ.",
  no_previous_period: "هذه أول فترة للعضو. صحّح شهر الانضمام بدلًا من التراجع.",
  period_has_payments: "لا يمكن: توجد أشهر مدفوعة أو معلّقة في هذه الفترة.",
  join_month_invalid: "شهر الانضمام يجب أن يكون قبل آخر تغيير في حالة العضو.",
  campaign_closed: "هذا التبرع أو هذه اللوحة أُغلق.",
  campaign_has_pending: "توجد مساهمات معلّقة. ثبّتها أو ارفضها قبل الإغلاق.",
  levy_member_required: "نصيب اللوحة يُدفع باسم عضو.",
  not_levy_member: "هذا العضو ليس في هذه اللوحة.",
  levy_exempt: "هذا العضو معفى من هذه اللوحة.",
  levy_full_share: "يُدفع نصيب اللوحة كاملًا في دفعة واحدة.",
  levy_share_paid: "نصيب هذا العضو في اللوحة مدفوع.",
  handover_in_progress: "يوجد تسليم جارٍ لم يكتمل.",
  handover_not_draft: "لم يعد هذا التسليم قابلاً للتعديل.",
  handover_not_submitted: "لم يُرسل هذا التسليم بعد.",
  handover_confirmed: "هذا التسليم مكتمل ولا يمكن إلغاؤه.",
  counted_required: "أدخل المبالغ الموجودة فعلاً قبل الإرسال.",
  same_person: "يستلم التسليمَ مسؤولٌ آخر (المسؤول الجديد).",
  no_open_term: "لا توجد دورة مفتوحة.",
  not_committee_member: "أحد المختارين ليس من أعضاء اللجنة.",
  not_a_wallet: "اختر محفظة (لا نقداً ولا سجلاً ورقياً).",
  account_exists: "هذا الرقم مضاف من قبل لنفس المحفظة.",
  account_in_use: "هذا الرقم مستعمل في دفعات أو مصاريف. غيّر الرقم بدل تعديله.",
  same_wallet: "اختر محفظتين مختلفتين.",
  not_enough: "المبلغ أكبر مما في المحفظة.",
  feature_retired: "هذه الخاصية لم تعد مستعملة.",
  opening_too_big: "رصيد البداية في الحسابات أكبر من رصيد بداية الصندوق.",
  cash_opening_derived:
    "النقد في البداية = رصيد بداية الصندوق ناقص ما في الحسابات، لا يُكتب باليد.",
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
    d.price ? `مستحقات شهر ${month} لـ ${who}: ${formatNumber(d.price)} أوقية.` : null,
};

/** not_enough (m43): DETAIL {"wallet": "بنكيلي", "balance": 36000} → «في بنكيلي 36 000 أوقية فقط.» */
function walletShort(detail: string | null | undefined): string | null {
  if (!detail) return null;
  try {
    const d = JSON.parse(detail) as { wallet?: unknown; balance?: unknown } | null;
    if (!d || typeof d.wallet !== "string" || !d.wallet.trim()) return null;
    if (typeof d.balance !== "number" || !Number.isInteger(d.balance) || d.balance < 0) return null;
    return `في ${d.wallet.trim()} ${formatNumber(d.balance)} أوقية فقط.`;
  } catch {
    return null;
  }
}

/** opening_too_big (m45): DETAIL {"available": 30000} → «المتاح 30 000 أوقية فقط.» */
function openingLeft(detail: string | null | undefined): string | null {
  if (!detail) return null;
  try {
    const d = JSON.parse(detail) as { available?: unknown } | null;
    if (!d || typeof d.available !== "number" || !Number.isInteger(d.available) || d.available < 0)
      return null;
    return `المتاح ${formatNumber(d.available)} أوقية فقط.`;
  } catch {
    return null;
  }
}

export function messageFor(code: string, detail?: string | null): string {
  if (!(code in MESSAGES)) return MESSAGES.unknown;
  if (code === "not_enough") return walletShort(detail) ?? MESSAGES.not_enough;
  if (code === "opening_too_big") return openingLeft(detail) ?? MESSAGES.opening_too_big;
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
