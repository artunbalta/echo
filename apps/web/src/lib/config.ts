/** Client-visible configuration, read from NEXT_PUBLIC_* env at build time. */
export const config = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  realtimeUrl: process.env.NEXT_PUBLIC_REALTIME_URL ?? "ws://localhost:2567",
};

export const hasSupabase = Boolean(config.supabaseUrl && config.supabaseAnonKey);
