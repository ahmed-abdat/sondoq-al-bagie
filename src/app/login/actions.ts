"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const supabase = await createClient();
  if (!supabase) return { error: "الخادم غير مهيأ بعد (إعدادات Supabase)." };

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "أدخل البريد وكلمة السر." };

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "البريد أو كلمة السر غير صحيحة." };

  const next = String(formData.get("next") ?? "");
  redirect(next.startsWith("/committee") ? next : "/committee");
}

export async function logout() {
  const supabase = await createClient();
  await supabase?.auth.signOut();
  redirect("/");
}
