export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
};

/** True when the public Supabase settings are present. */
export function isConfigured(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey);
}
