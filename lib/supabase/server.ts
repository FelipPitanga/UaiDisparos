import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { SUPABASE_URL } from "./config";

type RuntimeEnv = {
  SUPABASE_SECRET_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

function getRuntimeEnv(): RuntimeEnv {
  try {
    return getCloudflareContext().env as RuntimeEnv;
  } catch {
    return process.env as RuntimeEnv;
  }
}

function getServerKey() {
  const env = getRuntimeEnv();
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

  if (!key) {
    throw new Error("SUPABASE_SECRET_KEY não está configurada no Worker.");
  }

  return key;
}

export function getSupabaseAdmin() {
  return createClient(SUPABASE_URL, getServerKey(), {
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
