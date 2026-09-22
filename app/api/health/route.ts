import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  let supabaseServerAccess = false;
  let supabaseError: string | null = null;

  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("accounts")
      .select("id", { count: "exact", head: true });

    if (error) throw error;
    supabaseServerAccess = true;
  } catch (error) {
    supabaseError = error instanceof Error ? error.message : "Falha desconhecida no Supabase.";
  }

  const checks = {
    supabaseServerAccess,
  };

  return NextResponse.json(
    {
      ok: supabaseServerAccess,
      service: "UaiDisparos",
      runtime: "cloudflare-worker",
      checks,
      supabaseError,
      checkedAt: new Date().toISOString(),
    },
    {
      status: supabaseServerAccess ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
