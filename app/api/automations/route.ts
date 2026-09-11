import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const groupId = String(body?.group_id || "");
    const campaignId = String(body?.campaign_id || "");
    const senderInstanceId = String(body?.sender_instance_id || "");
    const active = body?.active === true;
    const authorizationConfirmed = body?.authorization_confirmed === true;

    if (!groupId || !campaignId || !senderInstanceId) {
      return NextResponse.json({ ok: false, error: "Selecione grupo, campanha e disparador." }, { status: 400 });
    }
    if (active && !authorizationConfirmed) {
      return NextResponse.json({ ok: false, error: "Confirme a base de autorização antes de ativar a automação." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const [{ data: group }, { data: campaign }, { data: sender }] = await Promise.all([
      supabase.from("groups").select("id,monitoring_enabled").eq("id", groupId).single(),
      supabase.from("campaigns").select("id,status").eq("id", campaignId).single(),
      supabase.from("instances").select("id,instance_role,status").eq("id", senderInstanceId).single(),
    ]);

    if (!group) return NextResponse.json({ ok: false, error: "Grupo não encontrado." }, { status: 404 });
    if (!campaign) return NextResponse.json({ ok: false, error: "Campanha não encontrada." }, { status: 404 });
    if (!sender || sender.instance_role !== "sender") return NextResponse.json({ ok: false, error: "Escolha uma instância disparadora." }, { status: 400 });

    const now = new Date().toISOString();
    const { data: existing } = await supabase.from("group_automations").select("id").eq("group_id", groupId).maybeSingle();
    let result;

    if (existing?.id) {
      const { data, error } = await supabase.from("group_automations").update({
        campaign_id: campaignId,
        sender_instance_id: senderInstanceId,
        active,
        authorization_confirmed: authorizationConfirmed,
        updated_at: now,
      }).eq("id", existing.id).select("*").single();
      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await supabase.from("group_automations").insert({
        group_id: groupId,
        campaign_id: campaignId,
        sender_instance_id: senderInstanceId,
        active,
        authorization_confirmed: authorizationConfirmed,
        updated_at: now,
      }).select("*").single();
      if (error) throw error;
      result = data;
    }

    if (active && !group.monitoring_enabled) {
      await supabase.from("groups").update({ monitoring_enabled: true, updated_at: now }).eq("id", groupId);
    }

    return NextResponse.json({ ok: true, automation: result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Erro ao salvar automação." }, { status: 500 });
  }
}
