"use server";

import { redirect } from "next/navigation";
import { parseLogin } from "@/lib/data/logins";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string };

/** Committee sign-in with an email OR a phone number (same mapping as account creation). */
export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const supabase = await createClient();
  if (!supabase) return { error: "الخادم غير مهيأ بعد (إعدادات Supabase)." };

  // Text copied from a WhatsApp message carries invisible direction marks (LRI/PDI, LRM…) and
  // stray spaces around the login or password; they are never part of either, so drop them.
  const clean = (v: FormDataEntryValue | null) =>
    String(v ?? "")
      .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "")
      .trim();
  const raw = clean(formData.get("login") ?? formData.get("email"));
  const password = clean(formData.get("password"));
  if (!raw.trim() || !password) return { error: "أدخل البريد أو رقم الهاتف وكلمة السر." };
  const who = parseLogin(raw);
  if (!who) return { error: "أدخل بريداً صحيحاً أو رقم هاتف موريتاني من 8 أرقام." };

  const { data, error } = await supabase.auth.signInWithPassword({
    email: who.authEmail,
    password,
  });
  if (error) return { error: "البيانات غير صحيحة. تحقق من البريد أو الرقم وكلمة السر." };

  // The password is right, but the committee pages open only for an active committee account
  // (RLS shows the row only then). Say so here instead of bouncing back to this page silently.
  const { data: row } = await supabase
    .from("committee")
    .select("active")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (!row?.active) {
    await supabase.auth.signOut();
    return { error: "هذا الحساب موقوف أو ليس من حسابات اللجنة. اطلب من المسؤول تفعيله." };
  }

  const next = String(formData.get("next") ?? "");
  redirect(next.startsWith("/committee") ? next : "/committee");
}

export async function logout() {
  const supabase = await createClient();
  await supabase?.auth.signOut();
  redirect("/");
}
