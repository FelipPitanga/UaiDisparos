import { NextRequest, NextResponse } from "next/server";
import { getSupabaseSession } from "@/lib/supabase/session";
import { requireSuperAdmin, type PermissionKey } from "@/lib/tenant";

export const dynamic = "force-dynamic";

const PERMISSION_KEYS: PermissionKey[] = [
  "overview", "instances", "groups", "leads", "campaigns",
  "group_broadcast", "private_broadcast", "operations", "notifications", "settings",
];

function normalizePermissions(value: unknown) {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const result: Record<string, boolean> = {};
  for (const key of PERMISSION_KEYS) result[key] = source[key] === true;
  return result;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requireSuperAdmin();
    const id = String(params.id || "");
    const body = await req.json();
    const supabase = getSupabaseSession();

    const { data: current } = await supabase.from("accounts").select("id,is_primary,instance_limit").eq("id", id).maybeSingle();
    if (!current) return NextResponse.json({ ok: false, error: "Conta não encontrada." }, { status: 404 });

    const { count: usedInstances } = await supabase.from("instances").select("*", { count: "exact", head: true }).eq("account_id", id);
    const nextLimit = Math.max(0, Math.min(10000, Math.round(Number(body?.instance_limit ?? current.instance_limit))));
    if (nextLimit < Number(usedInstances || 0)) {
      return NextResponse.json({ ok: false, error: `Essa conta já usa ${usedInstances || 0} instâncias. O limite não pode ser menor.` }, { status: 400 });
    }

    const [{ data: settings }, { data: otherAccounts }] = await Promise.all([
      supabase.from("system_settings").select("global_instance_capacity").eq("id", 1).single(),
      supabase.from("accounts").select("instance_limit").neq("id", id),
    ]);
    const capacity = Number(settings?.global_instance_capacity || 0);
    const allocatedOther = (otherAccounts || []).reduce((sum, item: any) => sum + Number(item.instance_limit || 0), 0);
    if (allocatedOther + nextLimit > capacity) {
      return NextResponse.json({ ok: false, error: `Capacidade global excedida. Máximo disponível para esta conta: ${Math.max(0, capacity - allocatedOther)}.` }, { status: 400 });
    }

    const values: Record<string, unknown> = { instance_limit: nextLimit, updated_at: new Date().toISOString() };
    if (typeof body?.name === "string" && body.name.trim()) values.name = body.name.trim().slice(0, 100);
    if (!current.is_primary && ["active", "suspended"].includes(String(body?.status))) values.status = body.status;
    if (body?.permissions && typeof body.permissions === "object") values.permissions = normalizePermissions(body.permissions);

    const { data, error } = await supabase.from("accounts").update(values).eq("id", id).select("*").single();
    if (error) throw error;
    return NextResponse.json({ ok: true, account: data });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Erro ao atualizar conta." }, { status: 500 });
  }
}
