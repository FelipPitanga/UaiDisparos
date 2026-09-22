import { NextRequest, NextResponse } from "next/server";
import { getSupabaseSession } from "@/lib/supabase/session";
import { requireTenantId } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const accountId = requireTenantId();
    const body = await req.json().catch(() => ({}));
    const active = body?.active === true;
    const supabase = getSupabaseSession();

    const { data: current, error: currentError } = await supabase
      .from("group_automations")
      .select("id,authorization_confirmed")
      .eq("id", params.id)
      .eq("account_id", accountId)
      .single();

    if (currentError || !current) {
      return NextResponse.json({ ok: false, error: "Automação não encontrada." }, { status: 404 });
    }

    if (active && !current.authorization_confirmed) {
      return NextResponse.json(
        { ok: false, error: "Confirme a autorização de contato antes de reativar." },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("group_automations")
      .update({ active, updated_at: now })
      .eq("id", params.id)
      .eq("account_id", accountId)
      .select("*")
      .single();

    if (error) throw error;

    if (!active) {
      await supabase
        .from("jobs")
        .update({ status: "paused", error_message: "Automação pausada", updated_at: now })
        .eq("automation_id", params.id)
        .eq("account_id", accountId)
        .in("status", ["queued", "processing"]);
    } else {
      await supabase
        .from("jobs")
        .update({ status: "queued", error_message: null, processed_at: null, updated_at: now })
        .eq("automation_id", params.id)
        .eq("account_id", accountId)
        .eq("status", "paused");
    }

    return NextResponse.json({ ok: true, automation: data });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Erro ao alterar automação." },
      { status: 500 },
    );
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const accountId = requireTenantId();
    const supabase = getSupabaseSession();
    const now = new Date().toISOString();

    await supabase
      .from("jobs")
      .update({ status: "paused", error_message: "Automação excluída", updated_at: now })
      .eq("automation_id", params.id)
      .eq("account_id", accountId)
      .in("status", ["queued", "processing"]);

    const { error } = await supabase.from("group_automations").delete().eq("id", params.id).eq("account_id", accountId);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Erro ao excluir automação." },
      { status: 500 },
    );
  }
}
