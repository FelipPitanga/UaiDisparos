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

export async function POST() {
  try {
    const supabase = getSupabaseAdmin();
    const { data: instances, error } = await supabase
      .from("instances")
      .select("id,name,status,phone,base_url,api_token")
      .not("base_url", "is", null)
      .not("api_token", "is", null);

    if (error) throw error;

    const results: any[] = [];
    for (const instance of instances ?? []) {
      try {
        const response = await fetch(`${String(instance.base_url).replace(/\/$/, "")}/instance/status`, {
          method: "GET",
          headers: { Accept: "application/json", token: instance.api_token },
          cache: "no-store",
        });

        if (!response.ok) {
          results.push({ id: instance.id, ok: false, http: response.status });
          continue;
        }

        const text = await response.text();
        let provider: any = null;
        try { provider = text ? JSON.parse(text) : null; } catch { provider = null; }
        const normalized = normalizeStatus(provider);
        const now = new Date().toISOString();

        await supabase
          .from("instances")
          .update({
            status: normalized.status,
            phone: normalized.phone || instance.phone,
            last_seen_at: now,
            updated_at: now,
          })
          .eq("id", instance.id);

        results.push({ id: instance.id, ok: true, from: instance.status, to: normalized.status });
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
