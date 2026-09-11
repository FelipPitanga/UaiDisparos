import { NextRequest, NextResponse } from "next/server";
import { UazapiProvider } from "@/lib/providers/uazapi";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function sanitizePayload(payload: any) {
  if (!payload || typeof payload !== "object") return payload;
  const copy = { ...payload };
  if ("token" in copy) copy.token = "[redacted]";
  if ("apikey" in copy) copy.apikey = "[redacted]";
  return copy;
}

export async function POST(req: NextRequest) {
  const payload = await req.json().catch(() => null);
  if (!payload) return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });

  const secret = process.env.UAZAPI_WEBHOOK_SECRET;
  if (secret) {
    const provided = req.headers.get("x-webhook-secret");
    if (provided !== secret) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const provider = new UazapiProvider({ baseUrl: "", token: "" });
  const normalized = provider.normalizeWebhook(payload);
  const supabase = getSupabaseAdmin();
  const payloadToken = typeof payload?.token === "string" ? payload.token : null;
  const instanceName = typeof payload?.instanceName === "string" ? payload.instanceName : null;

  try {
    let instance: any = null;

    if (payloadToken) {
      const { data, error } = await supabase
        .from("instances")
        .select("id,name,instance_role")
        .eq("api_token", payloadToken)
        .maybeSingle();
      if (error) throw error;
      instance = data;
    }

    if (!instance && instanceName) {
      const { data, error } = await supabase
        .from("instances")
        .select("id,name,instance_role")
        .eq("name", instanceName)
        .maybeSingle();
      if (error) throw error;
      instance = data;
    }

    const safePayload = sanitizePayload(payload);

    const { data: evt, error: evtErr } = await supabase
      .from("webhook_events")
      .insert({
        instance_id: instance?.id ?? null,
        provider: "uazapi",
        event_type: normalized.type,
        group_external_id: normalized.groupId ?? null,
        participant_external_id: normalized.participantId ?? null,
        phone: normalized.phone,
        lid: normalized.lid,
        payload: safePayload,
        processed: false,
      })
      .select("id")
      .single();

    if (evtErr || !evt) throw evtErr ?? new Error("webhook_event_not_saved");

    if (normalized.type !== "participant_joined" || !normalized.participantId) {
      await supabase
        .from("webhook_events")
        .update({ processed: true, processed_at: new Date().toISOString() })
        .eq("id", evt.id);

      return NextResponse.json({ ok: true, ignored: true, reason: "not_participant_join", normalized });
    }

    if (!instance?.id) {
      await supabase
        .from("webhook_events")
        .update({ processed: true, processing_error: "instance_not_identified", processed_at: new Date().toISOString() })
        .eq("id", evt.id);
      return NextResponse.json({ ok: true, ignored: true, reason: "instance_not_identified", normalized });
    }

    const { data: group, error: groupError } = normalized.groupId
      ? await supabase
          .from("groups")
          .select("id,instance_id,name,external_id,monitoring_enabled")
          .eq("instance_id", instance.id)
          .eq("external_id", normalized.groupId)
          .maybeSingle()
      : { data: null, error: null };

    if (groupError) throw groupError;

    if (!group?.monitoring_enabled) {
      await supabase
        .from("webhook_events")
        .update({ processed: true, processed_at: new Date().toISOString() })
        .eq("id", evt.id);

      return NextResponse.json({
        ok: true,
        ignored: true,
        reason: group ? "group_not_monitored" : "group_not_found_for_instance",
        normalized,
      });
    }

    const now = new Date().toISOString();
    const { data: existingLead, error: leadLookupError } = await supabase
      .from("leads")
      .select("id")
      .eq("group_id", group.id)
      .eq("external_participant_id", normalized.participantId)
      .maybeSingle();

    if (leadLookupError) throw leadLookupError;

    let leadId: string;

    if (existingLead?.id) {
      const { error: updateLeadError } = await supabase
        .from("leads")
        .update({
          phone: normalized.phone,
          lid: normalized.lid,
          last_seen_at: now,
          metadata: { source_event_id: evt.id, monitor_instance_id: instance.id },
          updated_at: now,
        })
        .eq("id", existingLead.id);
      if (updateLeadError) throw updateLeadError;
      leadId = existingLead.id;
    } else {
      const { data: createdLead, error: createLeadError } = await supabase
        .from("leads")
        .insert({
          instance_id: instance.id,
          group_id: group.id,
          external_participant_id: normalized.participantId,
          phone: normalized.phone,
          lid: normalized.lid,
          source: "group_join",
          consent_status: "unknown",
          status: "captured",
          first_seen_at: now,
          last_seen_at: now,
          metadata: { source_event_id: evt.id, monitor_instance_id: instance.id },
        })
        .select("id")
        .single();
      if (createLeadError || !createdLead) throw createLeadError ?? new Error("lead_not_created");
      leadId = createdLead.id;
    }

    await supabase
      .from("webhook_events")
      .update({ processed: true, processed_at: now })
      .eq("id", evt.id);

    return NextResponse.json({
      ok: true,
      captured: true,
      lead_id: leadId,
      monitor_instance: { id: instance.id, name: instance.name },
      group: { id: group.id, name: group.name },
      normalized,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: "processing_failed",
      detail: error instanceof Error ? error.message : "unknown error",
      normalized,
    }, { status: 500 });
  }
}
