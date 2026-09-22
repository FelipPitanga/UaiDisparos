import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { SUPABASE_URL } from "@/lib/supabase/config";

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
  let adminAccess = false;
  let errorMessage: string | null = null;

  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("accounts")
      .select("id", { count: "exact", head: true });

    if (error) throw error;
    adminAccess = true;
  } catch (error) {
    errorMessage = describe(error);
  }

  return NextResponse.json(
    {
      ok: adminAccess,
      service: "UaiDisparos",
      runtime: "cloudflare-worker",
      checks: {
        supabaseAdminAccess: adminAccess,
        supabaseProject: new URL(SUPABASE_URL).hostname.split(".")[0],
      },
      error: errorMessage,
      checkedAt: new Date().toISOString(),
    },
    {
      status: adminAccess ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
