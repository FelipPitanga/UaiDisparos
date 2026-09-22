import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireTenantId } from "@/lib/tenant";

export const dynamic = "force-dynamic";

const DISCONNECT_CONFIRMATIONS = 2;
const MIN_CONFIRMATION_MS = 20_000;

function normalizeStatus(provider: any) {
  const item = Array.isArray(provider) ? provider[0] : provider;
  const instance = item?.instance ?? item ?? {};
  const raw = instance?.status ?? item?.status ?? instance?.state ?? item?.state ?? null;
  const rawStatus = raw == null ? null : String(raw).toLowerCase();
  const allowed = ["disconnected", "connecting", "connected", "hibernated"];
  const status = rawStatus && allowed.includes(rawStatus) ? rawStatus : "unknown";
  const phone = instance?.owner ?? item?.owner ?? instance?.phone ?? item?.phone ?? null;
  return { status, phone: phone ? String(phone).replace(/\D/g, "") : null, rawStatus };
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
    const accountId = requireTenantId();
    const supabase = getSupabaseAdmin();
    const { data: instances, error } = await supabase
      .from("instances")
      .select("id,name,status,phone,instance_role,base_url,api_token,send_blocked_until,send_block_code,disconnect_probe_count,disconnect_first_seen_at")
      .eq("account_id", accountId)
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
        const nowDate = new Date();
        const now = nowDate.toISOString();
        const update: Record<string, any> = {
          phone: normalized.phone || instance.phone,
          last_seen_at: now,
          updated_at: now,
        };

        let effectiveStatus = instance.status;
        let disconnectProbeCount = Number(instance.disconnect_probe_count || 0);
        let disconnectFirstSeenAt = instance.disconnect_first_seen_at as string | null;
        let confirmedDisconnect = false;

        if (normalized.status === "connected") {
          effectiveStatus = "connected";
          disconnectProbeCount = 0;
          disconnectFirstSeenAt = null;
        } else if (normalized.status === "disconnected") {
          disconnectProbeCount += 1;
          disconnectFirstSeenAt = disconnectFirstSeenAt || now;
          const firstSeenMs = new Date(disconnectFirstSeenAt).getTime();
          const elapsedMs = Number.isFinite(firstSeenMs) ? nowDate.getTime() - firstSeenMs : 0;
          confirmedDisconnect = disconnectProbeCount >= DISCONNECT_CONFIRMATIONS && elapsedMs >= MIN_CONFIRMATION_MS;

          // Um único retorno "disconnected" da API pode ser transitório. Só mudamos o
          // estado real depois de duas verificações consecutivas separadas no tempo.
          if (confirmedDisconnect) effectiveStatus = "disconnected";
        } else if (normalized.status === "connecting" || normalized.status === "hibernated") {
          // Não trata connecting/hibernated como desconexão. Se já estava conectado,
          // preserva o estado até uma confirmação real; se ainda não conectou, exibe o estado atual.
          if (instance.status !== "connected") effectiveStatus = normalized.status;
          disconnectProbeCount = 0;
          disconnectFirstSeenAt = null;
        } else {
          // Payload desconhecido nunca deve virar "disconnected" por padrão.
          results.push({
            id: instance.id,
            ok: true,
            from: instance.status,
            to: instance.status,
            providerStatus: normalized.rawStatus,
            ignored: "unknown_provider_status",
          });
          continue;
        }

        update.status = effectiveStatus;
        update.disconnect_probe_count = disconnectProbeCount;
        update.disconnect_first_seen_at = disconnectFirstSeenAt;

        let restriction: ReturnType<typeof parseLimits> | null = null;
        let limitsHttp: number | null = null;

        if (effectiveStatus === "connected" && instance.instance_role === "sender") {
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
        } else if (confirmedDisconnect) {
          update.send_blocked_until = null;
          update.send_block_reason = null;
          update.send_block_code = null;
        }

        const { error: updateError } = await supabase.from("instances").update(update).eq("id", instance.id).eq("account_id", accountId);
        if (updateError) throw updateError;

        // A notificação de desconexão é criada somente pelo trigger do banco quando
        // o status realmente muda de connected -> disconnected. Assim evitamos
        // alertas duplicados e falsos positivos por respostas transitórias da UAZAPI.
        results.push({
          id: instance.id,
          ok: true,
          from: instance.status,
          provider: normalized.status,
          to: effectiveStatus,
          disconnectProbeCount,
          confirmedDisconnect,
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
