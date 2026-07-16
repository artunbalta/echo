/** Client-visible configuration, read from NEXT_PUBLIC_* env at build time. */
export const config = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  realtimeUrl: process.env.NEXT_PUBLIC_REALTIME_URL ?? "ws://localhost:2567",
  /**
   * Supabase Storage bucket for generated sprite sheets. The default is exactly what
   * lib/character.ts had hardcoded, so behaviour is unchanged unless this is explicitly set.
   *
   * NEXT_PUBLIC_ on purpose. .env.example documented this as `ART_STORAGE_BUCKET`, which no code
   * ever read — and could not have: uploadSheet() runs in the BROWSER, and Next only exposes
   * NEXT_PUBLIC_* to the client, so an unprefixed name is not merely unwired, it is unwirable.
   * That made it a trap: set ART_STORAGE_BUCKET=my-bucket, create "my-bucket" in the dashboard, and
   * uploads still fail against a hardcoded "characters" with no hint why. A bucket name is not a
   * secret, so the fix is to publish it properly rather than delete the knob.
   */
  artStorageBucket: process.env.NEXT_PUBLIC_ART_STORAGE_BUCKET || "characters",
};

export const hasSupabase = Boolean(config.supabaseUrl && config.supabaseAnonKey);
