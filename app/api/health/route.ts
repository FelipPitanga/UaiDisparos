import { NextResponse } from "next/server";
import { getSupabaseAdmin, getSupabaseServerKeyInfo } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function describeError(error: unknown) {
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
  let supabaseServerAccess = false;
  let supabaseError: string | null = null;
  const keyInfo = getSupabaseServerKeyInfo();

  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("accounts")
      .select("id", { count: "exact", head: true });

    if (error) throw error;
    supabaseServerAccess = true;
  } catch (error) {
    supabaseError = describeError(error);
  }

  return NextResponse.json(
    {
      ok: supabaseServerAccess,
      service: "UaiDisparos",
      runtime: "cloudflare-worker",
      checks: {
        supabaseServerAccess,
        serverCredentialConfigured: keyInfo.configured,
        serverCredentialSource: keyInfo.source,
        serverCredentialType: keyInfo.type,
      },
      supabaseError,
      checkedAt: new Date().toISOString(),
    },
    {
      status: supabaseServerAccess ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
