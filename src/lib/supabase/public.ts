import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { supabaseEnv } from "./env";

/**
 * Anonymous client with no cookies: reads only the public views. Safe inside cached server
 * functions (its result never depends on who is asking). Null when Supabase is not configured.
 */
export function createPublicClient() {
  const env = supabaseEnv();
  if (!env) return null;
  return createClient<Database>(env.url, env.key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}
