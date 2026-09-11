import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { UazapiProvider } from "@/lib/providers/uazapi";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type UazGroup = {
  JID?: string;
  Name?: string;
  Topic?: string;
  OwnerJID?: string;
  AddressingMode?: string;
  GroupCreated?: string;
  Participants?: unknown[];
  IsLocked?: boolean;
  IsAnnounce?: boolean;
};

function extractGroups(payload: any): UazGroup[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.groups)) return payload.groups;
  if (Array.isArray(payload?.data?.groups)) return payload.data.groups;
  return [];
}

async function configureGroupsWebhook(record: any) {
  const webhookUrl = process.env.UAZAPI_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    return { configured: false, warning: "UAZAPI_WEBHOOK_URL não configurada." };
  }

  const baseUrl = String(record.base_url).replace(/\/$/, "");
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    token: String(record.api_token),
  };

  let action: "add" | "update" = "add";
  try {
    const current = await fetch(`${baseUrl}/webhook`, { method: "GET", headers, cache: "no-store" });
    if (current.ok) {
      const currentBody = await current.json().catch(() => null);
      if (currentBody && (currentBody.id || currentBody.url || currentBody.enabled)) action = "update";
    }
  } catch {}

  let response = await fetch(`${baseUrl}/webhook`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      enabled: true,
      url: webhookUrl,
      events: ["groups"],
      excludeMessages: [],
      addUrlEvents: false,
      addUrlTypesMessages: false,
      action,
    }),
    cache: "no-store",
  });

  if (!response.ok && action === "update") {
    response = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        enabled: true,
        url: webhookUrl,
        events: ["groups"],
        excludeMessages: [],
        addUrlEvents: false,
        addUrlTypesMessages: false,
        action: "add",
      }),
      cache: "no-store",
    });
  }

  if (!response.ok) {
    const text = await response.text();
    return { configured: false, warning: `Webhook não configurado: UAZAPI ${response.status} ${text}` };
  }

  return { configured: true, warning: null };
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const instanceId = String(body?.instanceId ?? "");

    if (!instanceId) {
      return NextResponse.json({ ok: false, error: "Escolha uma instância monitoradora." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: instance, error: instanceError } = await supabase
      .from("instances")
      .select("id,name,status,instance_role,base_url,api_token")
      .eq("id", instanceId)
      .single();

    if (instanceError || !instance) {
      return NextResponse.json({ ok: false, error: "Instância não encontrada." }, { status: 404 });
    }

    if (!["monitor", "both"].includes(instance.instance_role)) {
      return NextResponse.json({ ok: false, error: "Essa instância não está marcada como monitoradora." }, { status: 400 });
    }

    if (instance.status !== "connected") {
      return NextResponse.json({ ok: false, error: "Conecte o WhatsApp dessa instância antes de sincronizar." }, { status: 400 });
    }

    if (!instance.base_url || !instance.api_token) {
      return NextResponse.json({ ok: false, error: "Credenciais da instância incompletas." }, { status: 400 });
    }

    const provider = new UazapiProvider({ baseUrl: instance.base_url, token: instance.api_token });
    const payload = await provider.listGroups(false);
    const groups = extractGroups(payload).filter((group) => Boolean(group.JID));
    const now = new Date().toISOString();

    const rows = groups.map((group) => ({
      instance_id: instance.id,
      external_id: group.JID!,
      name: group.Name || group.JID,
      subject: group.Topic || null,
      member_count: Array.isArray(group.Participants) ? group.Participants.length : null,
      updated_at: now,
      metadata: {
        owner_jid: group.OwnerJID ?? null,
        addressing_mode: group.AddressingMode ?? null,
        group_created: group.GroupCreated ?? null,
        is_locked: Boolean(group.IsLocked),
        is_announce: Boolean(group.IsAnnounce),
      },
    }));

    if (rows.length) {
      const { error: groupsError } = await supabase
        .from("groups")
        .upsert(rows, { onConflict: "instance_id,external_id" });
      if (groupsError) throw new Error(`Falha ao salvar grupos: ${groupsError.message}`);
    }

    const webhook = await configureGroupsWebhook(instance);

    await supabase
      .from("instances")
      .update({
        webhook_enabled: webhook.configured,
        last_seen_at: now,
        updated_at: now,
      })
      .eq("id", instance.id);

    revalidatePath("/grupos");
    revalidatePath("/");

    return NextResponse.json({
      ok: true,
      synced: rows.length,
      instanceId: instance.id,
      webhookConfigured: webhook.configured,
      warning: webhook.warning,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
