import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

function normalizeQr(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  if (value.startsWith("data:image")) return value;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return `data:image/png;base64,${value}`;
}

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin();
    const { data: record, error } = await supabase
      .from("instances")
      .select("id,name,base_url,api_token,status")
      .eq("id", params.id)
      .single();

    if (error || !record) {
      return NextResponse.json({ ok: false, error: "Instância não encontrada." }, { status: 404 });
    }

    if (!record.base_url || !record.api_token) {
      return NextResponse.json({ ok: false, error: "Credenciais da instância incompletas." }, { status: 400 });
    }

    const response = await fetch(`${String(record.base_url).replace(/\/$/, "")}/instance/connect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        token: record.api_token,
      },
      body: JSON.stringify({}),
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
    const qr = normalizeQr(instance?.qrcode ?? item?.qrcode ?? instance?.qrCode ?? item?.qrCode);
    const pairCode = instance?.paircode ?? item?.paircode ?? null;
    const nextStatus = instance?.status === "connected" ? "connected" : "connecting";

    await supabase
      .from("instances")
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", record.id);

    return NextResponse.json({ ok: true, qrcode: qr, pairCode, status: nextStatus });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Erro ao gerar QR Code." },
      { status: 500 },
    );
  }
}
