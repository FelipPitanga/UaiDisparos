import { getSupabaseAdmin } from "@/lib/supabase/server";
import { UazapiProvider } from "@/lib/providers/uazapi";

function extractMessageId(value: any) {
  return value?.messageId || value?.id || value?.key?.id || value?.data?.messageId || value?.data?.id || null;
}

function normalizeButtons(buttons: any) {
  if (!Array.isArray(buttons)) return [];
  return buttons.map((button, index) => ({
    label: String(button?.label || button?.text || button?.value || "").trim().slice(0, 30),
    value: String(button?.value || button?.id || `btn_${index + 1}`).trim().slice(0, 250),
    type: ["reply", "url", "call", "copy"].includes(String(button?.type)) ? String(button.type) : "reply",
    id: String(button?.id || `btn_${index + 1}`).trim().slice(0, 50),
  })).filter((button) => button.label && button.value).slice(0, 3);
}

function renderText(template: string | null, recipient: any, groupName?: string | null) {
  const now = new Date();
  const replacements: Record<string, string> = {
    nome: recipient.name || "",
    telefone: recipient.phone || "",
    grupo: groupName || "",
    data: new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(now),
    hora: new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(now),
  };
  return String(template || "").replace(/\{\{\s*(nome|telefone|grupo|data|hora)\s*\}\}/gi, (_, key) => replacements[String(key).toLowerCase()] ?? "");
}

function saoPauloDayStartIso() {
  const now = new Date();
  const local = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, "0");
  const d = String(local.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}T03:00:00.000Z`;
}

function isDisconnectedSessionError(message: string) {
  const value = message.toLowerCase();
  return value.includes("whatsapp disconnected") || value.includes("session is not reconnectable");
}

function parseReachoutRestriction(message: string) {
  const value = message.toLowerCase();
  const restricted = value.includes("whatsapp_reachout_timelock") || value.includes("provider_code\\\":463") || value.includes("server error 463") || value.includes("temporary restriction for starting new conversations");
  if (!restricted) return null;

  const untilMatch = message.match(/\"until\"\s*:\s*\"([^\"]+)\"/i) || message.match(/"until"\s*:\s*"([^"]+)"/i);
  const untilRaw = untilMatch?.[1] || null;
  const untilMs = untilRaw ? Date.parse(untilRaw) : NaN;
  const until = Number.isFinite(untilMs) ? new Date(untilMs).toISOString() : new Date(Date.now() + 30 * 60 * 1000).toISOString();

  return {
    code: "WHATSAPP_REACHOUT_TIMELOCK",
    until,
    reason: "WhatsApp restringiu temporariamente o início de novas conversas nesta conta.",
  };
}

function formatLocalTime(iso: string) {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function friendlySendError(message: string) {
  const pt = message.match(/\"provider_message_ptbr\"\s*:\s*\"([^\"]+)\"/i) || message.match(/"provider_message_ptbr"\s*:\s*"([^"]+)"/i);
  if (pt?.[1]) return pt[1].replace(/\\n/g, " ").slice(0, 500);
  return message.length > 500 ? `${message.slice(0, 500)}…` : message;
}

async function senderUsageToday(supabase: any, senderIds: string[]) {
  const start = saoPauloDayStartIso();
  const [{ data: groupJobs }, { data: privateJobs }] = await Promise.all([
    supabase.from("jobs").select("instance_id,status").in("instance_id", senderIds).in("status", ["sent", "processing"]).gte("created_at", start),
    supabase.from("private_broadcast_recipients").select("instance_id,status").in("instance_id", senderIds).in("status", ["sent", "processing"]).gte("created_at", start),
  ]);
  const counts = new Map<string, number>();
  for (const row of [...(groupJobs || []), ...(privateJobs || [])]) {
    if (!row.instance_id) continue;
    counts.set(row.instance_id, (counts.get(row.instance_id) || 0) + 1);
  }
  return counts;
}

async function latestSenderSendAt(supabase: any, senderId: string) {
  const [{ data: groupLast }, { data: privateLast }] = await Promise.all([
    supabase.from("jobs").select("processed_at").eq("instance_id", senderId).eq("status", "sent").order("processed_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("private_broadcast_recipients").select("processed_at").eq("instance_id", senderId).eq("status", "sent").order("processed_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const values = [groupLast?.processed_at, privateLast?.processed_at].filter(Boolean).map((value) => Date.parse(String(value))).filter(Number.isFinite);
  return values.length ? Math.max(...values) : null;
}

async function chooseSender(supabase: any, broadcast: any, preferredId?: string | null) {
  const ids: string[] = Array.isArray(broadcast.sender_instance_ids) ? broadcast.sender_instance_ids : [];
  if (!ids.length) return { sender: null, reason: "no_sender" };

  const { data: senders } = await supabase
    .from("instances")
    .select("id,name,status,instance_role,base_url,api_token,send_blocked_until,send_block_reason,send_block_code")
    .in("id", ids);

  const usage = await senderUsageToday(supabase, ids);
  const limit = Number(broadcast.daily_limit_per_sender || 40);
  const intervalMs = Math.max(1, Number(broadcast.send_interval_seconds || 30)) * 1000;
  const byId = new Map((senders || []).map((item: any) => [item.id, item]));
  const ordered = preferredId && ids.includes(preferredId)
    ? [preferredId, ...ids.filter((id) => id !== preferredId)]
    : [...ids].sort((a, b) => (usage.get(a) || 0) - (usage.get(b) || 0));

  let soonest: number | null = null;
  let restrictedSoonest: number | null = null;

  for (const id of ordered) {
    const sender: any = byId.get(id);
    if (!sender || sender.instance_role !== "sender" || sender.status !== "connected" || !sender.base_url || !sender.api_token) continue;
    if ((usage.get(id) || 0) >= limit) continue;

    const blockedUntil = sender.send_blocked_until ? Date.parse(sender.send_blocked_until) : NaN;
    if (Number.isFinite(blockedUntil) && blockedUntil > Date.now()) {
      restrictedSoonest = restrictedSoonest == null ? blockedUntil : Math.min(restrictedSoonest, blockedUntil);
      continue;
    }

    const lastAt = await latestSenderSendAt(supabase, id);
    const nextAt = lastAt ? lastAt + intervalMs : 0;
    if (nextAt > Date.now()) {
      soonest = soonest == null ? nextAt : Math.min(soonest, nextAt);
      continue;
    }

    return { sender, usage: usage.get(id) || 0, limit };
  }

  if (restrictedSoonest != null) return { sender: null, reason: "restricted", nextAt: restrictedSoonest };
  return { sender: null, reason: "no_sender_ready", nextAt: soonest };
}

export async function processPrivateRecipient(id: string) {
  const supabase = getSupabaseAdmin();
  const { data: recipient, error } = await supabase.from("private_broadcast_recipients").select("*").eq("id", id).single();
  if (error || !recipient) throw error ?? new Error("Destinatário não encontrado.");
  if (recipient.status === "sent") return { ok: true, alreadySent: true };
  if (recipient.scheduled_at && Date.parse(recipient.scheduled_at) > Date.now()) return { ok: false, queued: true, reason: "scheduled" };

  const [{ data: broadcast }, { data: campaign }, { data: sourceGroup }] = await Promise.all([
    supabase.from("private_broadcasts").select("*").eq("id", recipient.broadcast_id).single(),
    supabase.from("campaigns").select("id,name,text_content,media_url,media_type,buttons,footer_text").eq("id", recipient.campaign_id).single(),
    recipient.source_group_id ? supabase.from("groups").select("name,external_id").eq("id", recipient.source_group_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  if (!broadcast || !campaign) {
    await supabase.from("private_broadcast_recipients").update({ status: "failed", error_message: "Campanha ou disparo privado não encontrado", processed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id);
    return { ok: false };
  }
  if (broadcast.status !== "active" || !broadcast.authorization_confirmed) {
    await supabase.from("private_broadcast_recipients").update({ status: "paused", error_message: "Disparo privado pausado ou sem autorização confirmada", updated_at: new Date().toISOString() }).eq("id", id);
    return { ok: false, paused: true };
  }

  const { data: suppressed } = await supabase.from("suppression_list").select("id").eq("phone", recipient.phone).limit(1).maybeSingle();
  if (suppressed) {
    await supabase.from("private_broadcast_recipients").update({ status: "skipped", error_message: "Destinatário na lista de supressão", processed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id);
    return { ok: false, skipped: true };
  }

  const choice = await chooseSender(supabase, broadcast, recipient.instance_id);
  if (!choice.sender) {
    const detail = choice.reason === "restricted" && choice.nextAt
      ? `Conta temporariamente impedida pelo WhatsApp de iniciar novas conversas até ${formatLocalTime(new Date(choice.nextAt).toISOString())}.`
      : "Aguardando conta disponível / intervalo / limite diário";
    const update: any = { status: "queued", error_message: detail, updated_at: new Date().toISOString() };
    if (choice.nextAt) update.scheduled_at = new Date(choice.nextAt).toISOString();
    await supabase.from("private_broadcast_recipients").update(update).eq("id", id);
    return { ok: false, queued: true };
  }

  const sender: any = choice.sender;
  const provider = new UazapiProvider({ baseUrl: sender.base_url, token: sender.api_token });
  const groupName = sourceGroup?.name || sourceGroup?.external_id || "";
  const text = renderText(campaign.text_content, recipient, groupName);
  const buttons = normalizeButtons(campaign.buttons);
  await supabase.from("private_broadcast_recipients").update({ status: "processing", instance_id: sender.id, attempts: Number(recipient.attempts || 0) + 1, error_message: null, scheduled_at: null, updated_at: new Date().toISOString() }).eq("id", id);

  try {
    const ids: string[] = [];
    if (campaign.media_url && campaign.media_type && campaign.media_type !== "none") {
      const mediaResult: any = await provider.sendMedia({ number: recipient.phone, file: campaign.media_url, type: campaign.media_type as any, text: buttons.length ? "" : text });
      const mediaId = extractMessageId(mediaResult);
      if (mediaId) ids.push(String(mediaId));
    }
    if (buttons.length) {
      const menuResult: any = await provider.sendMenu({
        number: recipient.phone,
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
      const result: any = await provider.sendText({ number: recipient.phone, text, linkPreview: false });
      const messageId = extractMessageId(result);
      if (messageId) ids.push(String(messageId));
    }

    const now = new Date().toISOString();
    await Promise.all([
      supabase.from("private_broadcast_recipients").update({ status: "sent", instance_id: sender.id, provider_message_id: ids.join(",") || null, processed_at: now, error_message: null, updated_at: now }).eq("id", id),
      supabase.from("instances").update({ send_blocked_until: null, send_block_reason: null, send_block_code: null }).eq("id", sender.id),
    ]);
    return { ok: true, sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro no envio";
    const now = new Date().toISOString();
    const restriction = parseReachoutRestriction(message);

    if (restriction) {
      const resumeAt = new Date(Date.parse(restriction.until) + 30_000).toISOString();
      await Promise.all([
        supabase.from("instances").update({
          send_blocked_until: restriction.until,
          send_block_reason: restriction.reason,
          send_block_code: restriction.code,
          updated_at: now,
        }).eq("id", sender.id),
        supabase.from("private_broadcast_recipients").update({
          status: "queued",
          error_message: `WhatsApp restringiu temporariamente novas conversas nesta conta até ${formatLocalTime(restriction.until)}. O envio será retomado depois desse horário.`,
          scheduled_at: resumeAt,
          processed_at: null,
          updated_at: now,
        }).eq("id", id),
      ]);
      return { ok: false, queued: true, restricted: true, until: restriction.until };
    }

    if (isDisconnectedSessionError(message)) {
      await Promise.all([
        supabase.from("instances").update({ status: "disconnected", updated_at: now }).eq("id", sender.id),
        supabase.from("private_broadcast_recipients").update({ status: "queued", error_message: "Conta realmente desconectada da sessão — aguardando outra conta ou reconexão", processed_at: null, updated_at: now }).eq("id", id),
      ]);
      return { ok: false, queued: true, disconnected: true };
    }

    const friendly = friendlySendError(message);
    await supabase.from("private_broadcast_recipients").update({ status: "failed", error_message: friendly, processed_at: now, updated_at: now }).eq("id", id);
    return { ok: false, error: friendly };
  }
}

export async function processPrivateQueue(limit = 20) {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { data: rows, error } = await supabase.from("private_broadcast_recipients").select("id").eq("status", "queued").or(`scheduled_at.is.null,scheduled_at.lte.${now}`).order("created_at", { ascending: true }).limit(limit);
  if (error) throw error;
  const results = [];
  for (const row of rows || []) {
    results.push({ id: row.id, result: await processPrivateRecipient(row.id) });
  }
  return results;
}
