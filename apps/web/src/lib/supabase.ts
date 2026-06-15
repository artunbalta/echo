import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config, hasSupabase } from "./config";

let client: SupabaseClient | null = null;

/** Returns a browser Supabase client, or null when Supabase isn't configured. */
export function getSupabase(): SupabaseClient | null {
  if (!hasSupabase) return null;
  if (!client) {
    client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}
