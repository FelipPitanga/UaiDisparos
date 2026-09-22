import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

function describe(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    return [value.message, value.details, value.hint, value.code]
      .filter(Boolean)
      .map(String)
      .join(" | ");
  }
  return String(error || "Erro desconhecido.");
}

export async function GET() {
  let projectReachable = false;
  let adminAccess = false;
  let projectError: string | null = null;
  let adminError: string | null = null;

  try {
    const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await client.from("accounts").select("id", { count: "exact", head: true });
    if (error) throw error;
    projectReachable = true;
  } catch (error) {
    projectError = describe(error);
  }

  try {
    const admin = getSupabaseAdmin();
    const { error } = await admin.from("accounts").select("id", { count: "exact", head: true });
    if (error) throw error;
    adminAccess = true;
  } catch (error) {
    adminError = describe(error);
  }

  return NextResponse.json(
    {
      ok: projectReachable,
      service: "UaiDisparos",
      runtime: "cloudflare-worker",
      checks: {
        supabaseProject: "ykiuehczcjuskeoyqmqm",
        projectReachable,
        backgroundAdminReady: adminAccess,
      },
      errors: {
        project: projectError,
        backgroundAdmin: adminError,
      },
      checkedAt: new Date().toISOString(),
    },
    {
      status: projectReachable ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
