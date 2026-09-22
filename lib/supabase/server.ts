import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { SUPABASE_URL } from "./config";

type RuntimeEnv = {
  SUPABASE_SECRET_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

type KeyInfo = {
  configured: boolean;
  source: "SUPABASE_SECRET_KEY" | "SUPABASE_SERVICE_ROLE_KEY" | "none";
  type: "secret" | "publishable" | "jwt_service_role" | "jwt_anon" | "jwt_unknown" | "unknown" | "none";
};

function readRuntimeKey(): { key?: string; source: KeyInfo["source"] } {
  try {
    const env = getCloudflareContext().env as RuntimeEnv;

    if (env.SUPABASE_SECRET_KEY) {
      return { key: env.SUPABASE_SECRET_KEY, source: "SUPABASE_SECRET_KEY" };
    }

    if (env.SUPABASE_SERVICE_ROLE_KEY) {
      return { key: env.SUPABASE_SERVICE_ROLE_KEY, source: "SUPABASE_SERVICE_ROLE_KEY" };
    }
  } catch {
    // Ambiente local/build sem contexto do Cloudflare.
  }

  if (process.env.SUPABASE_SECRET_KEY) {
    return { key: process.env.SUPABASE_SECRET_KEY, source: "SUPABASE_SECRET_KEY" };
  }

  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { key: process.env.SUPABASE_SERVICE_ROLE_KEY, source: "SUPABASE_SERVICE_ROLE_KEY" };
  }

  return { source: "none" };
}

function decodeJwtRole(key: string): string | null {
  try {
    const [, payload] = key.split(".");
    if (!payload) return null;

    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const json = JSON.parse(atob(padded));
    return typeof json?.role === "string" ? json.role : null;
  } catch {
    return null;
  }
}

export function getSupabaseServerKeyInfo(): KeyInfo {
  const { key, source } = readRuntimeKey();

  if (!key) {
    return { configured: false, source: "none", type: "none" };
  }

  if (key.startsWith("sb_secret_")) {
    return { configured: true, source, type: "secret" };
  }

  if (key.startsWith("sb_publishable_")) {
    return { configured: true, source, type: "publishable" };
  }

  if (key.startsWith("eyJ")) {
    const role = decodeJwtRole(key);
    if (role === "service_role") return { configured: true, source, type: "jwt_service_role" };
    if (role === "anon") return { configured: true, source, type: "jwt_anon" };
    return { configured: true, source, type: "jwt_unknown" };
  }

  return { configured: true, source, type: "unknown" };
}

function getSupabaseServerKey() {
  const { key } = readRuntimeKey();
  const info = getSupabaseServerKeyInfo();

  if (!key) {
    throw new Error("SUPABASE_SECRET_KEY não está configurada no Cloudflare Worker.");
  }

  if (info.type === "publishable" || info.type === "jwt_anon") {
    throw new Error(
      "A credencial configurada no servidor é pública/anon. Configure SUPABASE_SECRET_KEY com uma Secret key (sb_secret_...) ou uma service_role válida do projeto UaiDisparos.",
    );
  }

  return key;
}

export function getSupabaseAdmin() {
  const key = getSupabaseServerKey();

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
