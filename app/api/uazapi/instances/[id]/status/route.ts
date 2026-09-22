import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { processJob } from "@/lib/automation";
import { requireTenantId } from "@/lib/tenant";

function normalizeQr(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  if (value.startsWith("data:image") || value.startsWith("http://") || value.startsWith("https://")) return value;
  return "data:image/png;base64," + value;
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const accountId = requireTenantId();
    const supabase = getSupabaseAdmin();
    const { data: record, error } = await supabase.from("instances")
      .select("id,base_url,api_token,status,instance_role").eq("id", params.id).eq("account_id", accountId).single();
    if (error || !record) return NextResponse.json({ ok: false, error: "Instância não encontrada." }, { status: 404 });

    const response = await fetch(String(record.base_url).replace(/\/$/, "") + "/instance/status", {
      method: "GET", headers: { Accept: "application/json", token: record.api_token }, cache: "no-store",
    });
    const text = await response.text();
    let provider: any = null;
    try { provider = text ? JSON.parse(text) : null; } catch { provider = text; }
    if (!response.ok) return NextResponse.json({ ok: false, error: "UAZAPI " + response.status + ": " + (typeof provider === "string" ? provider : JSON.stringify(provider)) }, { status: 502 });

    const item = Array.isArray(provider) ? provider[0] : provider;
    const instance = item?.instance ?? item ?? {};
    const rawStatus = String(instance?.status ?? item?.status ?? "disconnected");
    const status = ["disconnected","connecting","connected","hibernated"].includes(rawStatus) ? rawStatus : "disconnected";
    const phone = instance?.owner ?? item?.owner ?? instance?.phone ?? item?.phone ?? null;
    const qr = normalizeQr(instance?.qrcode ?? item?.qrcode ?? instance?.qrCode ?? item?.qrCode);
    const now = new Date().toISOString();

    await supabase.from("instances").update({
      status, phone: phone ? String(phone).replace(/\D/g, "") : null, last_seen_at: now, updated_at: now,
    }).eq("id", record.id).eq("account_id", accountId);

    let resumed = 0;
    if (record.instance_role === "sender" && record.status !== "connected" && status === "connected") {
      const { data: queuedJobs } = await supabase.from("jobs").select("id")
        .eq("account_id", accountId).eq("instance_id", record.id).eq("status", "queued")
        .order("created_at", { ascending: true }).limit(20);
      for (const job of queuedJobs ?? []) { try { await processJob(job.id); resumed += 1; } catch {} }
    }

    return NextResponse.json({ ok: true, status, phone, qrcode: qr, resumed });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Erro ao consultar status." }, { status: 500 });
  }
}
