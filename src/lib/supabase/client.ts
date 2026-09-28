import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { supabaseEnv } from "./env";

export function createClient() {
  const env = supabaseEnv();
  if (!env) throw new Error("Supabase env vars are missing (.env.local)");
  return createBrowserClient<Database>(env.url, env.key);
}
