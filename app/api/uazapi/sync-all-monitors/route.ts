import { NextResponse } from "next/server";
import { UazapiProvider } from "@/lib/providers/uazapi";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { enqueueForAutomation } from "@/lib/automation";

export const dynamic = "force-dynamic";

type UazParticipant = {
  JID?: string;
  Jid?: string;
  jid?: string;
  PhoneNumber?: string;
  Phone?: string;
  phone?: string;
  LID?: string;
  Lid?: string;
  lid?: string;
};

type UazGroup = {
  JID?: string;
  Name?: string;
  Topic?: string;
  OwnerJID?: string;
  AddressingMode?: string;
  GroupCreated?: string;
  Participants?: UazParticipant[];
  IsLocked?: boolean;
  IsAnnounce?: boolean;
  IsParent?: boolean;
  IsCommunity?: boolean;
  IsCommunityAnnounce?: boolean;
  LinkedParent?: string;
  linkedParent?: string;
};

function extractGroups(payload: any): UazGroup[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.groups)) return payload.groups;
  if (Array.isArray(payload?.data?.groups)) return payload.data.groups;
  return [];
}

function digits(value?: string | null) {
  return value ? String(value).replace(/\D/g, "") : null;
}

function normalizeParticipant(participant: UazParticipant) {
  const jidRaw = participant?.JID ?? participant?.Jid ?? participant?.jid ?? null;
  const lidRaw = participant?.LID ?? participant?.Lid ?? participant?.lid ?? null;
  const phoneRaw = participant?.PhoneNumber ?? participant?.Phone ?? participant?.phone ?? null;

  const jid = jidRaw ? String(jidRaw) : null;
  const lid = lidRaw ? String(lidRaw) : jid?.endsWith("@lid") ? jid : null;
  const explicitPhone = digits(phoneRaw);
  const jidPhone = jid?.endsWith("@s.whatsapp.net") ? digits(jid.split("@")[0]) : null;
  const phone = explicitPhone || jidPhone;
  const participantId = jid || lid || (phone ? `${phone}@s.whatsapp.net` : null);

  // Quando houver telefone, ele continua sendo a identidade principal. Em comunidades
  // algumas entradas vêm somente como @lid; nesse caso o próprio LID vira a chave.
  const key = phone || lid || participantId;
  return { key, phone, lid, participantId };
}

async function captureParticipants(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  monitor: { id: string; name: string },
  dbGroup: { id: string; external_id: string; name: string; monitoring_enabled: boolean },
  participants: UazParticipant[],
) {
  if (!dbGroup.monitoring_enabled || !Array.isArray(participants)) return { baseline: 0, captured: 0 };

  const normalized = participants
    .map(normalizeParticipant)
    .filter((item) => Boolean(item.key));

  const { data: snapshots, error: snapshotError } = await supabase
    .from("group_participant_snapshots")
    .select("participant_key,present")
    .eq("group_id", dbGroup.id);
  if (snapshotError) throw snapshotError;

  const now = new Date().toISOString();
  const existingKeys = new Set((snapshots ?? []).map((item: any) => String(item.participant_key)));
  const currentKeys = new Set(normalized.map((item) => String(item.key)));

  // Primeira leitura de um grupo/comunidade já monitorado = cria a linha de base.
  // Assim membros antigos NÃO entram como leads novos sem a opção explícita de backfill.
  if (!snapshots?.length) {
    if (normalized.length) {
      const { error } = await supabase.from("group_participant_snapshots").insert(
        normalized.map((item) => ({
          group_id: dbGroup.id,
          participant_key: item.key,
          external_participant_id: item.participantId,
          phone: item.phone,
          lid: item.lid,
          present: true,
          first_seen_at: now,
          last_seen_at: now,
          updated_at: now,
        })),
      );
      if (error) throw error;
    }
    return { baseline: normalized.length, captured: 0 };
  }

  let captured = 0;

  for (const item of normalized) {
    if (!item.key) continue;

    if (existingKeys.has(item.key)) {
      await supabase
        .from("group_participant_snapshots")
        .update({
          present: true,
          external_participant_id: item.participantId,
          phone: item.phone,
          lid: item.lid,
          last_seen_at: now,
          updated_at: now,
        })
        .eq("group_id", dbGroup.id)
        .eq("participant_key", item.key);
      continue;
    }

    const { error: snapshotInsertError } = await supabase.from("group_participant_snapshots").insert({
      group_id: dbGroup.id,
      participant_key: item.key,
      external_participant_id: item.participantId,
      phone: item.phone,
      lid: item.lid,
      present: true,
      first_seen_at: now,
      last_seen_at: now,
      updated_at: now,
    });
    if (snapshotInsertError && snapshotInsertError.code !== "23505") throw snapshotInsertError;

    const identity = item.phone || item.lid || item.participantId;
    if (!identity) continue;
    const dedupeKey = `${dbGroup.external_id}|${identity}`;

    const { data: existingLead, error: leadLookupError } = await supabase
      .from("leads")
      .select("id,capture_count")
      .eq("dedupe_key", dedupeKey)
      .maybeSingle();
    if (leadLookupError) throw leadLookupError;

    let leadId: string;
    if (existingLead?.id) {
      leadId = existingLead.id;
      await supabase.from("leads").update({
        instance_id: monitor.id,
        group_id: dbGroup.id,
        external_participant_id: item.participantId,
        phone: item.phone,
        lid: item.lid,
        last_seen_at: now,
        capture_count: Number(existingLead.capture_count || 1) + 1,
        updated_at: now,
        metadata: { source: "group_sync", last_monitor_instance_id: monitor.id, identity_type: item.phone ? "phone" : "lid" },
      }).eq("id", leadId);
    } else {
      const { data: createdLead, error: leadInsertError } = await supabase.from("leads").insert({
        instance_id: monitor.id,
        group_id: dbGroup.id,
        external_participant_id: item.participantId,
        phone: item.phone,
        lid: item.lid,
        source: "group_sync_join",
        source_group_external_id: dbGroup.external_id,
        dedupe_key: dedupeKey,
        capture_count: 1,
        consent_status: "unknown",
        status: "captured",
        first_seen_at: now,
        last_seen_at: now,
        metadata: { source: "group_sync", first_monitor_instance_id: monitor.id, identity_type: item.phone ? "phone" : "lid" },
      }).select("id").single();
      if (leadInsertError || !createdLead) throw leadInsertError ?? new Error("lead_not_created");
      leadId = createdLead.id;
      captured += 1;
    }

    // A UAZAPI aceita chat ID como destino. Portanto LIDs de comunidades também podem
    // entrar na fila; a automação mantém o @lid intacto até o /send/*.
    if (identity) {
      try {
        await enqueueForAutomation({
          leadId,
          groupId: dbGroup.id,
          groupExternalId: dbGroup.external_id,
          identity,
          sourceTimestamp: now,
        });
      } catch {
        // A captura do lead não depende de existir uma automação ativa.
      }
    }
  }

  const missingKeys = [...existingKeys].filter((key) => !currentKeys.has(key));
  if (missingKeys.length) {
    await supabase
      .from("group_participant_snapshots")
      .update({ present: false, updated_at: now })
      .eq("group_id", dbGroup.id)
      .in("participant_key", missingKeys);
  }

  return { baseline: 0, captured };
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

    const results: Array<{ id: string; name: string; synced: number; captured: number; baseline: number; ok: boolean; error?: string }> = [];

    for (const monitor of monitors ?? []) {
      try {
        if (!monitor.base_url || !monitor.api_token) {
          results.push({ id: monitor.id, name: monitor.name, synced: 0, captured: 0, baseline: 0, ok: false, error: "Credenciais incompletas" });
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
            is_parent: Boolean(group.IsParent),
            is_community: Boolean(group.IsCommunity || group.IsParent),
            is_community_announce: Boolean(group.IsCommunityAnnounce),
            linked_parent: group.LinkedParent ?? group.linkedParent ?? null,
          },
        }));

        if (rows.length) {
          const { error: groupsError } = await supabase
            .from("groups")
            .upsert(rows, { onConflict: "instance_id,external_id" });
          if (groupsError) throw groupsError;
        }

        const { data: dbGroups, error: dbGroupsError } = await supabase
          .from("groups")
          .select("id,external_id,name,monitoring_enabled")
          .eq("instance_id", monitor.id);
        if (dbGroupsError) throw dbGroupsError;
        const byExternalId = new Map((dbGroups ?? []).map((group: any) => [group.external_id, group]));

        let captured = 0;
        let baseline = 0;
        for (const group of groups) {
          if (!group.JID) continue;
          const dbGroup = byExternalId.get(group.JID) as any;
          if (!dbGroup?.monitoring_enabled) continue;
          const result = await captureParticipants(supabase, monitor, dbGroup, group.Participants ?? []);
          captured += result.captured;
          baseline += result.baseline;
        }

        await supabase
          .from("instances")
          .update({ last_seen_at: now, updated_at: now })
          .eq("id", monitor.id);

        results.push({ id: monitor.id, name: monitor.name, synced: rows.length, captured, baseline, ok: true });
      } catch (monitorError) {
        results.push({
          id: monitor.id,
          name: monitor.name,
          synced: 0,
          captured: 0,
          baseline: 0,
          ok: false,
          error: monitorError instanceof Error ? monitorError.message : "Erro ao sincronizar monitor",
        });
      }
    }

    return NextResponse.json({
      ok: true,
      monitors: results.length,
      synced: results.reduce((total, item) => total + item.synced, 0),
      captured: results.reduce((total, item) => total + item.captured, 0),
      baseline: results.reduce((total, item) => total + item.baseline, 0),
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
