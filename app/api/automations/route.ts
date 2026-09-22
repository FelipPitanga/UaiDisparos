import { NextRequest, NextResponse } from "next/server";
import { getSupabaseSession } from "@/lib/supabase/session";
import { requireTenantId } from "@/lib/tenant";
import { enqueueForAutomation } from "@/lib/automation";

export const dynamic = "force-dynamic";

function uniqStrings(value: unknown, max: number) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => String(item || "").trim()).filter(Boolean))).slice(0, max);
}

export async function POST(req: NextRequest) {
  try {
    const accountId = requireTenantId();
    const body = await req.json();
    const groupId = String(body?.group_id || "");
    const campaignIds = uniqStrings(body?.campaign_ids?.length ? body.campaign_ids : [body?.campaign_id], 5);
    const senderInstanceIds = uniqStrings(body?.sender_instance_ids?.length ? body.sender_instance_ids : [body?.sender_instance_id], 10);
    const delaySeconds = Math.min(86400, Math.max(0, Number(body?.delay_seconds || 0)));
    const sendIntervalSeconds = Math.min(3600, Math.max(0, Number(body?.send_interval_seconds ?? 30)));
    const dailyLimitPerSender = Math.min(1000, Math.max(1, Number(body?.daily_limit_per_sender || 40)));
    const active = body?.active === true;
    const authorizationConfirmed = body?.authorization_confirmed === true;
    const includeNewLeads = body?.include_new_leads !== false;
    const includeCapturedLeads = body?.include_captured_leads === true;

    if (!groupId || !campaignIds.length || !senderInstanceIds.length) {
      return NextResponse.json({ ok: false, error: "Selecione grupo, ao menos uma campanha e ao menos um disparador." }, { status: 400 });
    }
    if (!includeNewLeads && !includeCapturedLeads) {
      return NextResponse.json({ ok: false, error: "Marque novos leads, leads já capturados, ou os dois." }, { status: 400 });
    }
    if (active && !authorizationConfirmed) {
      return NextResponse.json({ ok: false, error: "Confirme a base de autorização antes de ativar a automação." }, { status: 400 });
    }

    const supabase = getSupabaseSession();
    const [{ data: group }, campaignsResult, sendersResult] = await Promise.all([
      supabase.from("groups").select("id,external_id,monitoring_enabled").eq("id", groupId).eq("account_id", accountId).single(),
      supabase.from("campaigns").select("id,status").eq("account_id", accountId).in("id", campaignIds),
      supabase.from("instances").select("id,instance_role,status").eq("account_id", accountId).in("id", senderInstanceIds),
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
      account_id: accountId,
      campaign_id: campaignIds[0],
      sender_instance_id: senderInstanceIds[0],
      campaign_ids: campaignIds,
      sender_instance_ids: senderInstanceIds,
      delay_seconds: Math.round(delaySeconds),
      send_interval_seconds: Math.round(sendIntervalSeconds),
      daily_limit_per_sender: Math.round(dailyLimitPerSender),
      include_new_leads: includeNewLeads,
      active,
      authorization_confirmed: authorizationConfirmed,
      updated_at: now,
    };

    const { data: existing } = await supabase.from("group_automations").select("id").eq("group_id", groupId).eq("account_id", accountId).maybeSingle();
    let result;

    if (existing?.id) {
      const { data, error } = await supabase.from("group_automations").update(values).eq("id", existing.id).eq("account_id", accountId).select("*").single();
      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await supabase.from("group_automations").insert({ group_id: groupId, ...values }).select("*").single();
      if (error) throw error;
      result = data;
    }

    if (active && !group.monitoring_enabled) {
      await supabase.from("groups").update({ monitoring_enabled: true, updated_at: now }).eq("id", groupId).eq("account_id", accountId);
    }

    let capturedSummary: { found: number; queued: number; skipped: number; failed: number } | null = null;

    if (active && authorizationConfirmed && includeCapturedLeads) {
      const { data: capturedLeads, error: leadsError } = await supabase
        .from("leads")
        .select("id,phone,lid,external_participant_id,first_seen_at")
        .eq("group_id", groupId)
        .eq("account_id", accountId)
        .order("first_seen_at", { ascending: true });

      if (leadsError) throw leadsError;

      const eligibleLeads = (capturedLeads || []).filter((lead) => Boolean(lead.phone || lead.lid || lead.external_participant_id));
      const leadIds = eligibleLeads.map((lead) => lead.id);
      const existingJobLeadIds = new Set<string>();

      if (leadIds.length) {
        const { data: previousJobs, error: jobsError } = await supabase
          .from("jobs")
          .select("lead_id")
          .eq("automation_id", result.id)
          .eq("account_id", accountId)
          .in("lead_id", leadIds);
        if (jobsError) throw jobsError;
        for (const job of previousJobs || []) if (job.lead_id) existingJobLeadIds.add(job.lead_id);
      }

      let queued = 0;
      let skipped = 0;
      let failed = 0;

      for (const lead of eligibleLeads) {
        if (existingJobLeadIds.has(lead.id)) {
          skipped += 1;
          continue;
        }

        const identity = lead.phone || lead.lid || lead.external_participant_id;
        if (!identity) {
          skipped += 1;
          continue;
        }

        try {
          const enqueue = await enqueueForAutomation({
            leadId: lead.id,
            groupId,
            groupExternalId: group.external_id,
            identity,
            sourceTimestamp: lead.first_seen_at || null,
          });
          if (enqueue?.queued) queued += 1;
          else if (enqueue?.duplicate) skipped += 1;
          else failed += 1;
        } catch {
          failed += 1;
        }
      }

      capturedSummary = {
        found: eligibleLeads.length,
        queued,
        skipped,
        failed,
      };
    }

    return NextResponse.json({ ok: true, automation: result, captured_leads: capturedSummary });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Erro ao salvar automação." }, { status: 500 });
  }
}
