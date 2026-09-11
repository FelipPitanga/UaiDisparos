import { getSupabaseAdmin } from "@/lib/supabase/server";
import { UazapiProvider } from "@/lib/providers/uazapi";

type LeadLike = {
  id: string;
  phone: string | null;
  lid: string | null;
  name?: string | null;
};

type GroupLike = {
  id: string;
  name: string | null;
  external_id: string;
};

export function renderCampaignText(template: string | null, lead: LeadLike, group: GroupLike) {
  const now = new Date();
  const replacements: Record<string, string> = {
    nome: lead.name || "",
    telefone: lead.phone || "",
    grupo: group.name || group.external_id,
    data: new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(now),
    hora: new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(now),
  };

  return String(template || "").replace(/\{\{\s*(nome|telefone|grupo|data|hora)\s*\}\}/gi, (_, key) => replacements[String(key).toLowerCase()] ?? "");
}

function extractMessageId(value: any) {
  return value?.messageId || value?.id || value?.key?.id || value?.data?.messageId || value?.data?.id || null;
}

function normalizeButtons(buttons: any) {
  if (!Array.isArray(buttons)) return [];
  return buttons
    .map((button, index) => ({
      label: String(button?.label || button?.text || button?.value || "").trim().slice(0, 30),
      value: String(button?.value || button?.id || `btn_${index + 1}`).trim().slice(0, 250),
      type: ["reply", "url", "call", "copy"].includes(String(button?.type)) ? String(button.type) : "reply",
      id: String(button?.id || `btn_${index + 1}`).trim().slice(0, 50),
    }))
    .filter((button) => button.label && button.value)
    .slice(0, 3);
}

function tenSecondBucket(sourceTimestamp?: string | null) {
  const parsed = sourceTimestamp ? Date.parse(sourceTimestamp) : NaN;
  const value = Number.isFinite(parsed) ? parsed : Date.now();
  return new Date(Math.floor(value / 10000) * 10000).toISOString();
}

function isDisconnectedSessionError(message: string) {
  const value = message.toLowerCase();
  return value.includes("whatsapp disconnected") || value.includes("session is not reconnectable") || value.includes("uazapi request failed: 503");
}

export async function processJob(jobId: string) {
  const supabase = getSupabaseAdmin();

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id,status,attempts,lead_id,group_id,campaign_id,automation_id,instance_id,recipient,payload")
    .eq("id", jobId)
    .single();

  if (jobError || !job) throw jobError ?? new Error("Job não encontrado.");
  if (job.status === "sent") return { ok: true, alreadySent: true };

  const [{ data: lead }, { data: group }, { data: campaign }, { data: sender }, { data: automation }] = await Promise.all([
    supabase.from("leads").select("id,phone,lid,name,consent_status").eq("id", job.lead_id).single(),
    supabase.from("groups").select("id,name,external_id").eq("id", job.group_id).single(),
    supabase.from("campaigns").select("id,name,text_content,media_url,media_type,buttons,footer_text").eq("id", job.campaign_id).single(),
    supabase.from("instances").select("id,name,status,instance_role,base_url,api_token").eq("id", job.instance_id).single(),
    supabase.from("group_automations").select("id,active,authorization_confirmed").eq("id", job.automation_id).single(),
  ]);

  if (!lead || !group || !campaign || !sender || !automation) {
    await supabase.from("jobs").update({ status: "failed", error_message: "Dados incompletos do job", processed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", job.id);
    return { ok: false, error: "Dados incompletos do job" };
  }

  if (!automation.active || !automation.authorization_confirmed) {
    await supabase.from("jobs").update({ status: "paused", error_message: "Automação inativa ou sem confirmação de autorização", updated_at: new Date().toISOString() }).eq("id", job.id);
    return { ok: false, paused: true };
  }

  if (sender.instance_role !== "sender" || sender.status !== "connected" || !sender.base_url || !sender.api_token) {
    await supabase.from("jobs").update({ status: "queued", error_message: "Disparador offline — aguardando reconexão", processed_at: null, updated_at: new Date().toISOString() }).eq("id", job.id);
    return { ok: false, queued: true, error: "Disparador offline" };
  }

  const recipient = String(job.recipient || lead.phone || "").replace(/\D/g, "");
  if (!recipient) {
    await supabase.from("jobs").update({ status: "failed", error_message: "Lead sem telefone utilizável", processed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", job.id);
    return { ok: false, error: "Lead sem telefone utilizável" };
  }

  const { data: suppressed } = await supabase
    .from("suppression_list")
    .select("id")
    .or(`phone.eq.${recipient}${lead.lid ? `,lid.eq.${lead.lid}` : ""}`)
    .limit(1)
    .maybeSingle();

  if (suppressed) {
    await supabase.from("jobs").update({ status: "failed", error_message: "Destinatário na lista de supressão", processed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", job.id);
    return { ok: false, error: "Destinatário na lista de supressão" };
  }

  const text = renderCampaignText(campaign.text_content, lead, group);
  const provider = new UazapiProvider({ baseUrl: sender.base_url, token: sender.api_token });
  const buttons = normalizeButtons(campaign.buttons);

  await supabase.from("jobs").update({ status: "processing", attempts: Number(job.attempts || 0) + 1, error_message: null, updated_at: new Date().toISOString() }).eq("id", job.id);

  try {
    const ids: string[] = [];
    if (campaign.media_url && campaign.media_type && campaign.media_type !== "none") {
      const mediaResult: any = await provider.sendMedia({
        number: recipient,
        file: campaign.media_url,
        type: campaign.media_type as any,
        text: buttons.length ? "" : text,
      });
      const mediaId = extractMessageId(mediaResult);
      if (mediaId) ids.push(String(mediaId));
    }

    if (buttons.length) {
      const menuResult: any = await provider.sendMenu({
        number: recipient,
        text: text || campaign.name,
        choices: buttons.map((button) => {
          if (button.type === "url") return `${button.label}|${button.value.startsWith("http") ? button.value : `url:${button.value}`}`;
          if (button.type === "call") return `${button.label}|${button.value.startsWith("call:") ? button.value : `call:${button.value}`}`;
          if (button.type === "copy") return `${button.label}|${button.value.startsWith("copy:") ? button.value : `copy:${button.value}`}`;
          return `${button.label}|${button.value}`;
        }),
        footerText: campaign.footer_text || "",
      });
      const menuId = extractMessageId(menuResult);
      if (menuId) ids.push(String(menuId));
    } else if (!campaign.media_url && text) {
      const textResult: any = await provider.sendText({ number: recipient, text, linkPreview: false });
      const textId = extractMessageId(textResult);
      if (textId) ids.push(String(textId));
    }

    const now = new Date().toISOString();
    await supabase.from("jobs").update({
      status: "sent",
      provider_message_id: ids.join(",") || null,
      processed_at: now,
      error_message: null,
      payload: { ...(job.payload || {}), rendered_text: text, buttons },
      updated_at: now,
    }).eq("id", job.id);

    return { ok: true, sent: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro no envio";

    if (isDisconnectedSessionError(message)) {
      const now = new Date().toISOString();
      await Promise.all([
        supabase.from("instances").update({ status: "disconnected", updated_at: now }).eq("id", sender.id),
        supabase.from("jobs").update({
          status: "queued",
          error_message: "Disparador desconectado — aguardando reconexão",
          processed_at: null,
          updated_at: now,
        }).eq("id", job.id),
      ]);
      return { ok: false, queued: true, disconnected: true, error: message };
    }

    await supabase.from("jobs").update({ status: "failed", error_message: message, processed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", job.id);
    return { ok: false, error: message };
  }
}

export async function enqueueForAutomation(params: {
  leadId: string;
  groupId: string;
  groupExternalId: string;
  identity: string;
  sourceTimestamp?: string | null;
}) {
  const supabase = getSupabaseAdmin();
  const { data: automation } = await supabase
    .from("group_automations")
    .select("id,campaign_id,sender_instance_id,active,authorization_confirmed")
    .eq("group_id", params.groupId)
    .eq("active", true)
    .maybeSingle();

  if (!automation || !automation.authorization_confirmed) return { queued: false, reason: "no_active_authorized_automation" };

  const { data: lead } = await supabase.from("leads").select("phone,lid").eq("id", params.leadId).single();
  const recipient = String(lead?.phone || "").replace(/\D/g, "");
  if (!recipient) return { queued: false, reason: "lead_without_phone" };

  const bucket = tenSecondBucket(params.sourceTimestamp);
  const dedupeKey = `${automation.id}|${params.groupExternalId}|${params.identity}|${bucket}`;
  const now = new Date().toISOString();

  const { data: created, error } = await supabase
    .from("jobs")
    .insert({
      campaign_id: automation.campaign_id,
      lead_id: params.leadId,
      instance_id: automation.sender_instance_id,
      group_id: params.groupId,
      automation_id: automation.id,
      recipient,
      dedupe_key: dedupeKey,
      status: "queued",
      payload: { source: "group_join", group_external_id: params.groupExternalId },
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { queued: false, duplicate: true };
    throw error;
  }

  const processed = await processJob(created.id);
  return { queued: true, jobId: created.id, processed };
}
