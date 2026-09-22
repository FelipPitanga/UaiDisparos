import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
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

async function dashboard() {
  const supabase = getSupabaseAdmin();
  const [{ data: accounts }, { data: profiles }, { data: instances }, { data: settings }] = await Promise.all([
    supabase.from("accounts").select("id,name,status,instance_limit,permissions,is_primary,created_at").order("is_primary", { ascending: false }).order("created_at"),
    supabase.from("profiles").select("user_id,account_id,name,email,role,created_at"),
    supabase.from("instances").select("id,account_id,status"),
    supabase.from("system_settings").select("global_instance_capacity").eq("id", 1).maybeSingle(),
  ]);

  const profileByAccount = new Map((profiles || []).map((item: any) => [item.account_id, item]));
  const used = new Map<string, number>();
  for (const item of instances || []) {
    if (!item.account_id) continue;
    used.set(item.account_id, (used.get(item.account_id) || 0) + 1);
  }

  const rows = (accounts || []).map((account: any) => ({
    ...account,
    profile: profileByAccount.get(account.id) || null,
    used_instances: used.get(account.id) || 0,
    available_instances: Math.max(0, Number(account.instance_limit || 0) - (used.get(account.id) || 0)),
  }));

  const capacity = Number(settings?.global_instance_capacity || 0);
  const allocated = rows.reduce((sum: number, item: any) => sum + Number(item.instance_limit || 0), 0);
  const usedTotal = rows.reduce((sum: number, item: any) => sum + Number(item.used_instances || 0), 0);

  return {
    accounts: rows,
    capacity: {
      total: capacity,
      allocated,
      used: usedTotal,
      unallocated: Math.max(0, capacity - allocated),
      free_physical: Math.max(0, capacity - usedTotal),
    },
  };
}

export async function GET() {
  try {
    requireSuperAdmin();
    return NextResponse.json({ ok: true, ...(await dashboard()) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Acesso negado." }, { status: 403 });
  }
}

export async function POST(req: NextRequest) {
  try {
    requireSuperAdmin();
    const body = await req.json();
    const name = String(body?.name || "").trim().slice(0, 100);
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");
    const instanceLimit = Math.max(0, Math.min(10000, Math.round(Number(body?.instance_limit ?? 1))));
    const permissions = normalizePermissions(body?.permissions);

    if (name.length < 2) return NextResponse.json({ ok: false, error: "Informe o nome do cliente." }, { status: 400 });
    if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ ok: false, error: "Informe um e-mail válido." }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ ok: false, error: "A senha precisa ter pelo menos 8 caracteres." }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const [{ data: settings }, { data: accounts }] = await Promise.all([
      supabase.from("system_settings").select("global_instance_capacity").eq("id", 1).single(),
      supabase.from("accounts").select("instance_limit"),
    ]);
    const capacity = Number(settings?.global_instance_capacity || 0);
    const allocated = (accounts || []).reduce((sum, item: any) => sum + Number(item.instance_limit || 0), 0);
    if (allocated + instanceLimit > capacity) {
      return NextResponse.json({ ok: false, error: `O limite ultrapassa a capacidade global. Restam ${Math.max(0, capacity - allocated)} instâncias para distribuir.` }, { status: 400 });
    }

    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { name },
    });
    if (createError || !created.user) throw createError || new Error("Não foi possível criar o usuário.");

    const { data: profile } = await supabase.from("profiles").select("account_id").eq("user_id", created.user.id).single();
    if (!profile?.account_id) throw new Error("Perfil do cliente não foi criado.");

    const { error: accountError } = await supabase.from("accounts").update({
      name, instance_limit: instanceLimit, permissions, updated_at: new Date().toISOString(),
    }).eq("id", profile.account_id);
    if (accountError) throw accountError;

    return NextResponse.json({ ok: true, ...(await dashboard()) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Erro ao criar cliente." }, { status: 500 });
  }
}
