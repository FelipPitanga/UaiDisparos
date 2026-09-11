import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function uniqStrings(value: unknown, max: number) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => String(item || "").trim()).filter(Boolean))).slice(0, max);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const groupId = String(body?.group_id || "");
    const campaignIds = uniqStrings(body?.campaign_ids?.length ? body.campaign_ids : [body?.campaign_id], 5);
    const senderInstanceIds = uniqStrings(body?.sender_instance_ids?.length ? body.sender_instance_ids : [body?.sender_instance_id], 10);
    const delaySeconds = Math.min(86400, Math.max(0, Number(body?.delay_seconds || 0)));
    const sendIntervalSeconds = Math.min(3600, Math.max(0, Number(body?.send_interval_seconds ?? 30)));
    const dailyLimitPerSender = Math.min(1000, Math.max(1, Number(body?.daily_limit_per_sender || 40)));
    const active = body?.active === true;
    const authorizationConfirmed = body?.authorization_confirmed === true;

    if (!groupId || !campaignIds.length || !senderInstanceIds.length) {
      return NextResponse.json({ ok: false, error: "Selecione grupo, ao menos uma campanha e ao menos um disparador." }, { status: 400 });
    }
    if (active && !authorizationConfirmed) {
      return NextResponse.json({ ok: false, error: "Confirme a base de autorização antes de ativar a automação." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const [{ data: group }, campaignsResult, sendersResult] = await Promise.all([
      supabase.from("groups").select("id,monitoring_enabled").eq("id", groupId).single(),
      supabase.from("campaigns").select("id,status").in("id", campaignIds),
      supabase.from("instances").select("id,instance_role,status").in("id", senderInstanceIds),
    ]);

    if (!group) return NextResponse.json({ ok: false, error: "Grupo não encontrado." }, { status: 404 });

    const validCampaignIds = (campaignsResult.data || []).filter((item) => item.status === "active").map((item) => item.id);
    if (validCampaignIds.length !== campaignIds.length) {
      return NextResponse.json({ ok: false, error: "Uma ou mais campanhas não existem ou não estão ativas." }, { status: 400 });
    }

    const validSenderIds = (sendersResult.data || []).filter((item) => item.instance_role === "sender").map((item) => item.id);
    if (validSenderIds.length !== senderInstanceIds.length) {
      return NextResponse.json({ ok: false, error: "Uma ou mais contas selecionadas não são disparadores válidos." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const values = {
      campaign_id: campaignIds[0],
      sender_instance_id: senderInstanceIds[0],
      campaign_ids: campaignIds,
      sender_instance_ids: senderInstanceIds,
      delay_seconds: Math.round(delaySeconds),
      send_interval_seconds: Math.round(sendIntervalSeconds),
      daily_limit_per_sender: Math.round(dailyLimitPerSender),
      active,
      authorization_confirmed: authorizationConfirmed,
      updated_at: now,
    };

    const { data: existing } = await supabase.from("group_automations").select("id").eq("group_id", groupId).maybeSingle();
    let result;

    if (existing?.id) {
      const { data, error } = await supabase.from("group_automations").update(values).eq("id", existing.id).select("*").single();
      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await supabase.from("group_automations").insert({ group_id: groupId, ...values }).select("*").single();
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
