import { NextRequest, NextResponse } from "next/server";
import { getSupabaseSession } from "@/lib/supabase/session";
import { requireSuperAdmin } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  try {
    requireSuperAdmin();
    const body = await req.json();
    const capacity = Math.max(0, Math.min(100000, Math.round(Number(body?.global_instance_capacity ?? 0))));
    const supabase = getSupabaseSession();
    const { data: accounts } = await supabase.from("accounts").select("instance_limit");
    const allocated = (accounts || []).reduce((sum, item: any) => sum + Number(item.instance_limit || 0), 0);
    if (capacity < allocated) {
      return NextResponse.json({ ok: false, error: `A capacidade não pode ser menor que o total já distribuído (${allocated}).` }, { status: 400 });
    }
    const { data, error } = await supabase.from("system_settings").update({
      global_instance_capacity: capacity, updated_at: new Date().toISOString(),
    }).eq("id", 1).select("*").single();
    if (error) throw error;
    return NextResponse.json({ ok: true, settings: data });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Erro ao atualizar capacidade." }, { status: 500 });
  }
}
