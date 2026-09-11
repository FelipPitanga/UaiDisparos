import { NextResponse } from "next/server";
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

    const { data: instance, error: instanceError } = await supabase
      .from("instances")
      .upsert(
        {
          name: "UAZAPI Principal",
          provider: "uazapi",
          external_id: "uazapi-env-default",
          status: "connected",
          base_url: baseUrl,
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "external_id" },
      )
      .select("id")
      .single();

    if (instanceError || !instance) {
      throw new Error(`Falha ao salvar instância: ${instanceError?.message ?? "sem retorno"}`);
    }

    if (groups.length === 0) {
      return NextResponse.json({ ok: true, synced: 0, message: "Nenhum grupo retornado pela UAZAPI." });
    }

    const rows = groups.map((group) => ({
      instance_id: instance.id,
      external_id: group.JID!,
      name: group.Name || group.JID,
      subject: group.Topic || null,
      member_count: Array.isArray(group.Participants) ? group.Participants.length : null,
      updated_at: new Date().toISOString(),
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

    return NextResponse.json({ ok: true, synced: rows.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
