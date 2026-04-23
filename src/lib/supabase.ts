import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase client singleton, read from Vite env at build time.
 *
 * Creds live in `.env.local` (gitignored):
 *   VITE_SUPABASE_URL=https://<project>.supabase.co
 *   VITE_SUPABASE_ANON_KEY=<anon key>
 *
 * If either is missing we return `null` and callers fall back to mock
 * data — useful for CI, offline work, and preview builds that haven't
 * been given the env yet.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey, { auth: { persistSession: false } }) : null;

export const isSupabaseConfigured = Boolean(supabase);
