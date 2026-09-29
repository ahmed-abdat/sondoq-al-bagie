// Database errors → stable codes → Arabic messages. RPCs raise SQLSTATE P0001 with the code in
// HINT (see supabase/migrations/*_rpc.sql); anything else becomes a generic code.

export const MESSAGES = {
  // input / session
  invalid_input: "تحقق من البيانات المدخلة.",
  not_signed_in: "انتهت الجلسة. سجّل الدخول من جديد.",
  not_configured: "الخادم غير مهيأ بعد (إعدادات Supabase).",
  network: "تعذّر الاتصال. تحقق من الإنترنت وحاول مرة أخرى.",
  unknown: "حدث خطأ غير متوقع. حاول مرة أخرى.",
  // roles
  not_committee: "هذه العملية لأعضاء اللجنة فقط.",
  not_admin: "هذه العملية للمسؤول فقط.",
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
  cannot_delete_self: "لا يمكنك حذف حسابك.",
  member_link_admin_only: "ربط حسابك بعضو آخر أو إلغاء الربط يتم عند المسؤول.",
  member_not_active: "اختر عضواً نشطاً.",
  member_taken: "هذا العضو مربوط بحساب آخر في اللجنة.",
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
  future_date: "التاريخ في المستقبل.",
  id_taken: "تعذّر حفظ الدفعة، أعد المحاولة.",
  reason_required: "اكتب السبب.",
  undo_expired: "انتهت مهلة التراجع. ألغِ الدفعة مع ذكر السبب.",
  bad_transition: "لا يمكن تغيير حالة هذه الدفعة بهذه الطريقة.",
  append_only: "لا يمكن تعديل هذا السجل. ألغِه وسجّله من جديد.",
  wrong_month_amount: "مبلغ الشهر لا يساوي الرسوم الحالية. افتح الصفحة من جديد وحاول مرة أخرى.",
  no_price: "لم تُحدَّد رسوم هذه السنة لمجموعة العضو. راجع المسؤول.",
  month_not_owed: "هذا الشهر غير مستحق على العضو: قبل انضمامه، أو وهو معفى أو غادر.",
  // members / admin
  unknown_group: "المجموعة غير معروفة.",
  price_frozen: "لا يمكن تغيير رسوم سنة فيها دفعات مسجّلة.",
  member_required: "اختر العضو.",
  number_taken: "هذا الرقم مستخدم في نفس القائمة.",
  unknown_list: "القائمة غير معروفة (أ أو ب).",
  no_open_period: "لا توجد فترة عضوية مفتوحة لهذا العضو.",
  before_current_period: "التاريخ قبل بداية الحالة الحالية.",
  months_already_paid_after: "توجد أشهر مدفوعة بعد هذا التاريخ.",
  campaign_closed: "هذه الحملة مغلقة.",
  campaign_has_pending: "للحملة مساهمات بانتظار التأكيد. أكّدها أو ارفضها قبل الإغلاق.",
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

export function messageFor(code: string): string {
  return code in MESSAGES ? MESSAGES[code as ErrorCode] : MESSAGES.unknown;
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
  }
  if (err.code === "42501") return "not_committee";
  if (err.code === "22P02" || err.code === "23514" || err.code === "22023") return "invalid_input";
  if (err.code === "PGRST301" || err.code === "PGRST303") return "not_signed_in";
  if (!err.code && /fetch|network/i.test(err.message ?? "")) return "network";
  return "unknown";
}

export function failure(code: string) {
  return { ok: false as const, code, message: messageFor(code) };
}
