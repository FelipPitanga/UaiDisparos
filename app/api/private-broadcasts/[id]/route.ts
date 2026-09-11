import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const status = body?.status === "active" ? "active" : "paused";
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();
    const { data, error } = await supabase.from("private_broadcasts").update({ status, updated_at: now }).eq("id", params.id).select("*").single();
    if (error) throw error;
    if (status === "paused") {
      await supabase.from("private_broadcast_recipients").update({ status: "paused", updated_at: now }).eq("broadcast_id", params.id).eq("status", "queued");
    } else {
      await supabase.from("private_broadcast_recipients").update({ status: "queued", error_message: null, updated_at: now }).eq("broadcast_id", params.id).eq("status", "paused");
    }
    return NextResponse.json({ ok: true, broadcast: data });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Erro ao atualizar disparo privado." }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();
    const { error } = await supabase.from("private_broadcasts").update({ status: "archived", updated_at: now }).eq("id", params.id);
    if (error) throw error;
    await supabase.from("private_broadcast_recipients").update({ status: "paused", updated_at: now }).eq("broadcast_id", params.id).in("status", ["queued", "processing"]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Erro ao excluir disparo privado." }, { status: 500 });
  }
}
