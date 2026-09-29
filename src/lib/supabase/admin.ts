import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { MISSING_SECRET_MSG, supabaseSecretKey, supabaseUrl } from "./env";

/**
 * Admin client: bypasses Row Level Security. Use ONLY in trusted server code
 * (route handlers, server actions, scripts). Never import it from client code.
 */
function createAdminClient(): SupabaseClient<Database> {
  const url = supabaseUrl();
  const key = supabaseSecretKey();
  if (!(url && key)) throw new Error(MISSING_SECRET_MSG);
  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Non-throwing variant: null when the secret key is not configured. */
export function tryCreateAdminClient(): SupabaseClient<Database> | null {
  return supabaseUrl() && supabaseSecretKey() ? createAdminClient() : null;
}
