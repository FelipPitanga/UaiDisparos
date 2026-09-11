import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function normalizeStatus(provider: any) {
  const item = Array.isArray(provider) ? provider[0] : provider;
  const instance = item?.instance ?? item ?? {};
  const rawStatus = String(instance?.status ?? item?.status ?? "disconnected");
  const status = ["disconnected", "connecting", "connected", "hibernated"].includes(rawStatus)
    ? rawStatus
    : "disconnected";
  const phone = instance?.owner ?? item?.owner ?? instance?.phone ?? item?.phone ?? null;
  return { status, phone: phone ? String(phone).replace(/\D/g, "") : null };
}

function parseLimits(provider: any) {
  const details = provider?.details ?? provider?.data?.details ?? provider?.data ?? provider ?? {};
  const lock = details?.reachout_timelock ?? details?.reachoutTimeLock ?? null;
  const active = Boolean(lock?.active);
  const until = typeof lock?.until === "string" && lock.until ? lock.until : null;

  if (active) {
    return {
      blocked: true,
      code: "WHATSAPP_REACHOUT_TIMELOCK",
      until,
      reason: "WhatsApp restringiu temporariamente o início de novas conversas nesta conta.",
    };
  }

  return { blocked: false, code: null, until: null, reason: null };
}

async function getJson(url: string, token: string) {
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json", token },
    cache: "no-store",
  });
  const text = await response.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  return { response, body };
}

export async function POST() {
  try {
    const supabase = getSupabaseAdmin();
    const { data: instances, error } = await supabase
      .from("instances")
      .select("id,name,status,phone,instance_role,base_url,api_token,send_blocked_until,send_block_code")
      .not("base_url", "is", null)
      .not("api_token", "is", null);

    if (error) throw error;

    const results: any[] = [];
    for (const instance of instances ?? []) {
      try {
        const baseUrl = String(instance.base_url).replace(/\/$/, "");
        const statusResult = await getJson(`${baseUrl}/instance/status`, instance.api_token);

        if (!statusResult.response.ok) {
          results.push({ id: instance.id, ok: false, http: statusResult.response.status, stage: "status" });
          continue;
        }

        const normalized = normalizeStatus(statusResult.body);
        const now = new Date().toISOString();
        const update: Record<string, any> = {
          status: normalized.status,
          phone: normalized.phone || instance.phone,
          last_seen_at: now,
          updated_at: now,
        };

        let restriction: ReturnType<typeof parseLimits> | null = null;
        let limitsHttp: number | null = null;

        if (normalized.status === "connected" && instance.instance_role === "sender") {
          try {
            const limitsResult = await getJson(`${baseUrl}/instance/wa_messages_limits`, instance.api_token);
            limitsHttp = limitsResult.response.status;
            if (limitsResult.response.ok) {
              restriction = parseLimits(limitsResult.body);
              update.send_blocked_until = restriction.blocked ? restriction.until : null;
              update.send_block_reason = restriction.blocked ? restriction.reason : null;
              update.send_block_code = restriction.blocked ? restriction.code : null;
            }
          } catch {
            // Não derruba o monitor de conexão se o endpoint de limites falhar.
          }
        } else if (normalized.status !== "connected") {
          update.send_blocked_until = null;
          update.send_block_reason = null;
          update.send_block_code = null;
        }

        await supabase.from("instances").update(update).eq("id", instance.id);

        if (instance.status === "connected" && normalized.status !== "connected") {
          await supabase.from("notification_outbox").upsert({
            event_type: "disconnected",
            event_key: `instance_disconnected:${instance.id}:${Math.floor(Date.now() / 30000)}`,
            payload: {
              instance_id: instance.id,
              name: instance.name,
              phone: normalized.phone || instance.phone,
              status: normalized.status,
            },
            status: "pending",
          }, { onConflict: "event_key", ignoreDuplicates: true });
        }

        results.push({
          id: instance.id,
          ok: true,
          from: instance.status,
          to: normalized.status,
          restriction: restriction?.blocked ? { code: restriction.code, until: restriction.until } : null,
          limitsHttp,
        });
      } catch (error) {
        results.push({ id: instance.id, ok: false, error: error instanceof Error ? error.message : "Erro" });
      }
    }

    return NextResponse.json({ ok: true, checked: results.length, results });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Erro ao verificar instâncias." },
      { status: 500 },
    );
  }
}
