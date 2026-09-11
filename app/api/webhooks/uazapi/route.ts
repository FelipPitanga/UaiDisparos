import { NextRequest, NextResponse } from "next/server";
import { UazapiProvider } from "@/lib/providers/uazapi";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const payload = await req.json().catch(() => null);
  if (!payload) return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });

  const secret = process.env.UAZAPI_WEBHOOK_SECRET;
  if (secret) {
    const provided = req.headers.get("x-webhook-secret");
    if (provided !== secret) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const provider = new UazapiProvider({
    baseUrl: process.env.UAZAPI_BASE_URL ?? "",
    token: process.env.UAZAPI_TOKEN ?? "",
  });

  const normalized = provider.normalizeWebhook(payload);

  try {
    const supabase = getSupabaseAdmin();

    const { data: evt, error: evtErr } = await supabase
      .from("webhook_events")
      .insert({
        provider: "uazapi",
        event_type: normalized.type,
        group_external_id: normalized.groupId ?? null,
        participant_external_id: normalized.participantId ?? null,
        phone: normalized.phone,
        lid: normalized.lid,
        payload,
        processed: false,
      })
      .select("id")
      .single();

    if (evtErr) throw evtErr;

    if (normalized.type === "participant_joined" && normalized.participantId) {
      const { data: group } = normalized.groupId
        ? await supabase.from("groups").select("id, instance_id").eq("external_id", normalized.groupId).maybeSingle()
        : { data: null };

      const { error: leadErr } = await supabase
        .from("leads")
        .upsert({
          instance_id: group?.instance_id ?? null,
          group_id: group?.id ?? null,
          external_participant_id: normalized.participantId,
          phone: normalized.phone,
          lid: normalized.lid,
          source: "group_join",
          consent_status: "unknown",
          status: "captured",
          last_seen_at: new Date().toISOString(),
          metadata: { source_event_id: evt.id },
        }, { onConflict: "group_id,external_participant_id" });

      if (leadErr) throw leadErr;
    }

    await supabase.from("webhook_events").update({ processed: true, processed_at: new Date().toISOString() }).eq("id", evt.id);

    return NextResponse.json({ ok: true, normalized });
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: "processing_failed",
      detail: error?.message ?? "unknown error",
      normalized,
    }, { status: 500 });
  }
}
