import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

function normalizeQr(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  if (value.startsWith("data:image")) return value;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return `data:image/png;base64,${value}`;
}

function cleanPhone(value: unknown) {
  const phone = String(value ?? "").replace(/\D/g, "");
  return phone.length >= 10 ? phone : "";
}

function findPairCode(value: any): string | null {
  if (!value || typeof value !== "object") return null;

  const keys = [
    "paircode",
    "pairCode",
    "pairingcode",
    "pairingCode",
    "pair_code",
    "pairing_code",
    "code",
  ];

  for (const key of keys) {
    const candidate = value?.[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }

  for (const child of Object.values(value)) {
    if (child && typeof child === "object") {
      const found = findPairCode(child);
      if (found) return found;
    }
  }

  return null;
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
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

    const body = await request.json().catch(() => ({}));
    const phone = cleanPhone(body?.phone);
    const baseUrl = String(record.base_url).replace(/\/$/, "");

    const response = await fetch(`${baseUrl}/instance/connect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        token: record.api_token,
      },
      body: JSON.stringify(phone ? { phone } : {}),
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
    const pairCode = phone ? findPairCode(provider) : null;
    const qr = phone ? null : normalizeQr(instance?.qrcode ?? item?.qrcode ?? instance?.qrCode ?? item?.qrCode);
    const nextStatus = instance?.status === "connected" || item?.status === "connected" ? "connected" : "connecting";

    await supabase
      .from("instances")
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", record.id);

    if (phone && !pairCode) {
      return NextResponse.json(
        {
          ok: false,
          error: "A UAZAPI respondeu à solicitação, mas não devolveu o código de pareamento. Confira o número e tente novamente.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      qrcode: qr,
      pairCode,
      status: nextStatus,
      method: phone ? "code" : "qr",
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Erro ao iniciar conexão." },
      { status: 500 },
    );
  }
}
