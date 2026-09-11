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

export async function POST() {
  try {
    const baseUrl = process.env.UAZAPI_BASE_URL?.replace(/\/$/, "");
    const token = process.env.UAZAPI_TOKEN;

    if (!baseUrl || !token) {
      return NextResponse.json(
        { ok: false, error: "UAZAPI_BASE_URL ou UAZAPI_TOKEN não configurado." },
        { status: 500 },
      );
    }

    const provider = new UazapiProvider({ baseUrl, token });
    const payload = await provider.listGroups();
    const groups = extractGroups(payload).filter((group) => Boolean(group.JID));
    const supabase = getSupabaseAdmin();
    const externalId = "uazapi-env-default";
    const now = new Date().toISOString();

    const { data: existingInstance, error: lookupError } = await supabase
      .from("instances")
      .select("id")
      .eq("external_id", externalId)
      .maybeSingle();

    if (lookupError) {
      throw new Error(`Falha ao localizar instância: ${lookupError.message}`);
    }

    let instanceId: string;

    if (existingInstance?.id) {
      const { error: updateError } = await supabase
        .from("instances")
        .update({
          name: "UAZAPI Principal",
          provider: "uazapi",
          status: "connected",
          base_url: baseUrl,
          last_seen_at: now,
          updated_at: now,
        })
        .eq("id", existingInstance.id);

      if (updateError) {
        throw new Error(`Falha ao atualizar instância: ${updateError.message}`);
      }
      instanceId = existingInstance.id;
    } else {
      const { data: createdInstance, error: insertError } = await supabase
        .from("instances")
        .insert({
          name: "UAZAPI Principal",
          provider: "uazapi",
          external_id: externalId,
          status: "connected",
          base_url: baseUrl,
          last_seen_at: now,
          updated_at: now,
        })
        .select("id")
        .single();

      if (insertError || !createdInstance) {
        throw new Error(`Falha ao salvar instância: ${insertError?.message ?? "sem retorno"}`);
      }
      instanceId = createdInstance.id;
    }

    if (groups.length === 0) {
      return NextResponse.json({ ok: true, synced: 0, message: "Nenhum grupo retornado pela UAZAPI." });
    }

    const rows = groups.map((group) => ({
      instance_id: instanceId,
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

    const { error: groupsError } = await supabase
      .from("groups")
      .upsert(rows, { onConflict: "instance_id,external_id" });

    if (groupsError) {
      throw new Error(`Falha ao salvar grupos: ${groupsError.message}`);
    }

    revalidatePath("/grupos");
    revalidatePath("/");

    return NextResponse.json({ ok: true, synced: rows.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
