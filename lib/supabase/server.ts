import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { SUPABASE_URL } from "./config";

type RuntimeEnv = {
  SUPABASE_SECRET_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

function getSupabaseServerKey() {
  // Em produção no Cloudflare Workers, secrets são bindings do Worker.
  // process.env pode existir dependendo do modo/compatibilidade, mas não deve
  // ser nossa fonte principal de verdade.
  try {
    const env = getCloudflareContext().env as RuntimeEnv;
    const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
    if (key) return key;
  } catch {
    // next dev / build local sem contexto do Cloudflare: usa .env local.
  }

  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export function getSupabaseAdmin() {
  const key = getSupabaseServerKey();

  if (!key) {
    throw new Error(
      "Supabase server credentials are not configured in the Cloudflare Worker.",
    );
  }

  return createClient(SUPABASE_URL, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init = {}) =>
        fetch(input, {
          ...init,
          cache: "no-store",
        }),
    },
  });
}
