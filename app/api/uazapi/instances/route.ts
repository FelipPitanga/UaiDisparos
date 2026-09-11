import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

function cleanName(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

export async function POST(request: Request) {
  try {
    const baseUrl = process.env.UAZAPI_BASE_URL?.replace(/\/$/, "");
    const adminToken = process.env.UAZAPI_ADMIN_TOKEN;

    if (!baseUrl || !adminToken) {
      return NextResponse.json(
        { ok: false, error: "UAZAPI_BASE_URL ou UAZAPI_ADMIN_TOKEN não configurado." },
        { status: 500 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const name = cleanName(body?.name);
    const role = body?.role === "monitor" ? "monitor" : body?.role === "sender" ? "sender" : null;

    if (!name) {
      return NextResponse.json({ ok: false, error: "Informe um nome para a instância." }, { status: 400 });
    }

    if (!role) {
      return NextResponse.json(
        { ok: false, error: "Escolha Monitorador ou Disparador. Cada instância deve ter uma única função." },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: existing } = await supabase
      .from("instances")
      .select("id")
      .ilike("name", name)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ ok: false, error: "Já existe uma instância com esse nome." }, { status: 409 });
    }

    const response = await fetch(`${baseUrl}/instance/init`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        admintoken: adminToken,
      },
      body: JSON.stringify({
        name,
        systemName: "UaiDisparos",
        adminField01: role,
        adminField02: "uaidisparos",
      }),
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
    const token = item?.token ?? instance?.token ?? item?.apikey ?? instance?.apikey;
    const externalId = instance?.id ?? item?.id ?? null;
    const status = ["disconnected", "connecting", "connected", "hibernated"].includes(instance?.status)
      ? instance.status
      : "disconnected";

    if (!token) {
      return NextResponse.json({ ok: false, error: "A UAZAPI criou a instância, mas não retornou o token." }, { status: 502 });
    }

    const { data, error } = await supabase
      .from("instances")
      .insert({
        name,
        provider: "uazapi",
        external_id: externalId,
        status,
        base_url: baseUrl,
        api_token: token,
        instance_role: role,
        system_name: instance?.systemName ?? "UaiDisparos",
        updated_at: new Date().toISOString(),
      })
      .select("id,name,status,instance_role,phone,created_at")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, instance: data });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Erro ao criar instância." },
      { status: 500 },
    );
  }
}
