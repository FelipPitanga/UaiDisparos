import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const id = String(body?.id ?? "");
    const enabled = Boolean(body?.enabled);

    if (!id) {
      return NextResponse.json({ ok: false, error: "group_id_required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("groups")
      .update({ monitoring_enabled: enabled, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id,name,external_id,monitoring_enabled")
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, group: data });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown_error" },
      { status: 500 },
    );
  }
}
