import { createClient } from "@supabase/supabase-js";

// Sempre dado fresco: sem cache do Next.js, cada leitura (site, painel e robô) vê a última alteração.
const freshFetch: typeof fetch = (input, init) => fetch(input, { ...init, cache: "no-store" });

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: freshFetch } });
}
