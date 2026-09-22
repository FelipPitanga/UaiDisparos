import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

function errorMessage(error: unknown) {
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
  let databaseReachable = false;
  let databaseError: string | null = null;

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error } = await supabase
      .from("accounts")
      .select("id", { count: "exact", head: true });

    if (error) throw error;
    databaseReachable = true;
  } catch (error) {
    databaseError = errorMessage(error);
  }

  return NextResponse.json(
    {
      ok: databaseReachable,
      service: "UaiDisparos",
      runtime: "cloudflare-worker",
      checks: { databaseReachable, supabaseProject: "ykiuehczcjuskeoyqmqm" },
      databaseError,
      checkedAt: new Date().toISOString(),
    },
    { status: databaseReachable ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
