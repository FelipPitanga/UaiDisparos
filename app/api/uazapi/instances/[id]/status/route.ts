import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

function normalizeQr(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  if (value.startsWith("data:image")) return value;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return `data:image/png;base64,${value}`;
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin();
    const { data: record, error } = await supabase
      .from("instances")
      .select("id,base_url,api_token")
      .eq("id", params.id)
      .single();

    if (error || !record) {
      return NextResponse.json({ ok: false, error: "Instância não encontrada." }, { status: 404 });
    }

    const response = await fetch(`${String(record.base_url).replace(/\/$/, "")}/instance/status`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        token: record.api_token,
      },
      cache: "no-store",
    });

    const text = await response.text();
    let provider: any = null;
    try {
      provider = text ? JSON.parse(text) : null;
    } catch {
      provider = text;
    }

    if (!response.ok) {
      return NextResponse.json(
        { ok: false, error: `UAZAPI ${response.status}: ${typeof provider === "string" ? provider : JSON.stringify(provider)}` },
        { status: 502 },
      );
    }

    const item = Array.isArray(provider) ? provider[0] : provider;
    const instance = item?.instance ?? item ?? {};
    const rawStatus = String(instance?.status ?? item?.status ?? "disconnected");
    const status = ["disconnected", "connecting", "connected", "hibernated"].includes(rawStatus)
      ? rawStatus
      : "disconnected";
    const phone = instance?.owner ?? item?.owner ?? instance?.phone ?? item?.phone ?? null;
    const qr = normalizeQr(instance?.qrcode ?? item?.qrcode ?? instance?.qrCode ?? item?.qrCode);

    await supabase
      .from("instances")
      .update({
        status,
        phone: phone ? String(phone).replace(/\D/g, "") : null,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", record.id);

    return NextResponse.json({ ok: true, status, phone, qrcode: qr });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Erro ao consultar status." },
      { status: 500 },
    );
  }
}
