"use server";

import { redirect } from "next/navigation";
import { parseLogin } from "@/lib/data/logins";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string };

/** Committee sign-in with an email OR a phone number (same mapping as account creation). */
export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const supabase = await createClient();
  if (!supabase) return { error: "الخادم غير مهيأ بعد (إعدادات Supabase)." };

  const raw = String(formData.get("login") ?? formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!raw.trim() || !password) return { error: "أدخل البريد أو رقم الهاتف وكلمة السر." };
  const who = parseLogin(raw);
  if (!who) return { error: "أدخل بريداً صحيحاً أو رقم هاتف موريتاني من 8 أرقام." };

  const { error } = await supabase.auth.signInWithPassword({ email: who.authEmail, password });
  if (error) return { error: "البيانات غير صحيحة. تحقق من البريد أو الرقم وكلمة السر." };

  const next = String(formData.get("next") ?? "");
  redirect(next.startsWith("/committee") ? next : "/committee");
}

export async function logout() {
  const supabase = await createClient();
  await supabase?.auth.signOut();
  redirect("/");
}
