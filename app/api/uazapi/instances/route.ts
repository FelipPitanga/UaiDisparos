import { NextResponse } from "next/server";
import { getSupabaseSession } from "@/lib/supabase/session";
import { getTenantContext } from "@/lib/tenant";

function cleanName(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
}

export async function POST(request: Request) {
  try {
    const context = getTenantContext();
    const accountId = context.accountId;
    const baseUrl = process.env.UAZAPI_BASE_URL?.replace(/\/$/, "");
    const adminToken = process.env.UAZAPI_ADMIN_TOKEN;
    if (!baseUrl || !adminToken) {
      return NextResponse.json({ ok: false, error: "UAZAPI_BASE_URL ou UAZAPI_ADMIN_TOKEN não configurado." }, { status: 500 });
    }

    const body = await request.json().catch(() => ({}));
    const name = cleanName(body?.name);
    const requestedRole = body?.role === "monitor" ? "monitor" : body?.role === "sender" ? "sender" : null;
    if (!name) return NextResponse.json({ ok: false, error: "Informe um nome para a instância." }, { status: 400 });

    const supabase = getSupabaseSession();
    const { data: currentProfile } = await supabase
      .from("profiles")
      .select("permissions")
      .eq("user_id", context.userId)
      .maybeSingle();

    const userPermissions = currentProfile?.permissions && typeof currentProfile.permissions === "object"
      ? currentProfile.permissions as Record<string, boolean>
      : null;
    const connectorOnly = context.role !== "super_admin"
      && userPermissions?.overview === true
      && userPermissions?.instances === true
      && ["groups","leads","campaigns","group_broadcast","private_broadcast","operations","notifications","settings"]
        .every((key) => userPermissions?.[key] !== true);

    const role = connectorOnly ? "sender" : requestedRole;
    if (!role) return NextResponse.json({ ok: false, error: "Escolha Monitorador ou Disparador. Cada instância deve ter uma única função." }, { status: 400 });
    const [{ data: account }, { count: used }, { data: existing }] = await Promise.all([
      supabase.from("accounts").select("id,status,instance_limit").eq("id", accountId).single(),
      supabase.from("instances").select("*", { count: "exact", head: true }).eq("account_id", accountId),
      supabase.from("instances").select("id").eq("account_id", accountId).ilike("name", name).maybeSingle(),
    ]);

    if (!account || account.status !== "active") return NextResponse.json({ ok: false, error: "Conta suspensa ou inválida." }, { status: 403 });
    if (Number(used || 0) >= Number(account.instance_limit || 0)) {
      return NextResponse.json({ ok: false, error: "Limite de instâncias atingido (" + String(used || 0) + "/" + String(account.instance_limit) + "). Fale com o administrador para aumentar sua cota." }, { status: 403 });
    }
    if (existing) return NextResponse.json({ ok: false, error: "Já existe uma instância com esse nome nesta conta." }, { status: 409 });

    const response = await fetch(baseUrl + "/instance/init", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", admintoken: adminToken },
      body: JSON.stringify({ name, systemName: "UaiDisparos", adminField01: role, adminField02: accountId }),
      cache: "no-store",
    });
    const text = await response.text();
    let provider: any = null;
    try { provider = text ? JSON.parse(text) : null; } catch { provider = text; }
    if (!response.ok) {
      return NextResponse.json({ ok: false, error: "UAZAPI " + response.status + ": " + (typeof provider === "string" ? provider : JSON.stringify(provider)) }, { status: 502 });
    }

    const item = Array.isArray(provider) ? provider[0] : provider;
    const instance = item?.instance ?? item ?? {};
    const token = item?.token ?? instance?.token ?? item?.apikey ?? instance?.apikey;
    const externalId = instance?.id ?? item?.id ?? null;
    const status = ["disconnected","connecting","connected","hibernated"].includes(instance?.status) ? instance.status : "disconnected";
    if (!token) return NextResponse.json({ ok: false, error: "A UAZAPI criou a instância, mas não retornou o token." }, { status: 502 });

    const { data, error } = await supabase.from("instances").insert({
      account_id: accountId, name, provider: "uazapi", external_id: externalId, status,
      base_url: baseUrl, api_token: token, instance_role: role,
      system_name: instance?.systemName ?? "UaiDisparos", updated_at: new Date().toISOString(),
    }).select("id,name,status,instance_role,phone,created_at").single();

    if (error) {
      const message = String(error.message || "");
      if (message.includes("instance_limit_reached")) return NextResponse.json({ ok: false, error: "Limite de instâncias da conta atingido." }, { status: 403 });
      if (message.includes("global_instance_capacity_reached")) return NextResponse.json({ ok: false, error: "Capacidade global de instâncias atingida." }, { status: 403 });
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, instance: data, quota: { used: Number(used || 0) + 1, limit: Number(account.instance_limit || 0) } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Erro ao criar instância." }, { status: 500 });
  }
}
