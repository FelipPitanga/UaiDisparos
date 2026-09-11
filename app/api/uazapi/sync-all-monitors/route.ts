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
    const supabase = getSupabaseAdmin();
    const { data: monitors, error } = await supabase
      .from("instances")
      .select("id,name,status,instance_role,base_url,api_token")
      .eq("instance_role", "monitor")
      .eq("status", "connected");

    if (error) throw error;

    const results: Array<{ id: string; name: string; synced: number; ok: boolean; error?: string }> = [];

    for (const monitor of monitors ?? []) {
      try {
        if (!monitor.base_url || !monitor.api_token) {
          results.push({ id: monitor.id, name: monitor.name, synced: 0, ok: false, error: "Credenciais incompletas" });
          continue;
        }

        const provider = new UazapiProvider({ baseUrl: monitor.base_url, token: monitor.api_token });
        const payload = await provider.listGroups(false);
        const groups = extractGroups(payload).filter((group) => Boolean(group.JID));
        const now = new Date().toISOString();

        const rows = groups.map((group) => ({
          instance_id: monitor.id,
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
          if (groupsError) throw groupsError;
        }

        await supabase
          .from("instances")
          .update({ last_seen_at: now, updated_at: now })
          .eq("id", monitor.id);

        results.push({ id: monitor.id, name: monitor.name, synced: rows.length, ok: true });
      } catch (monitorError) {
        results.push({
          id: monitor.id,
          name: monitor.name,
          synced: 0,
          ok: false,
          error: monitorError instanceof Error ? monitorError.message : "Erro ao sincronizar monitor",
        });
      }
    }

    return NextResponse.json({
      ok: true,
      monitors: results.length,
      synced: results.reduce((total, item) => total + item.synced, 0),
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Erro ao sincronizar monitoradores." },
      { status: 500 },
    );
  }
}
