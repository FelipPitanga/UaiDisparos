import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const h = headers();
  const userId = h.get("x-uai-user-id");
  const accountId = h.get("x-uai-account-id");
  const role = h.get("x-uai-role") || "client";
  if (!userId || !accountId) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const [{ data: profile }, { data: account }, { count: usedInstances }] = await Promise.all([
    supabase.from("profiles").select("name,email,role").eq("user_id", userId).maybeSingle(),
    supabase.from("accounts").select("id,name,status,instance_limit,permissions").eq("id", accountId).maybeSingle(),
    supabase.from("instances").select("*", { count: "exact", head: true }).eq("account_id", accountId),
  ]);
  if (!profile || !account) return NextResponse.json({ ok: false, error: "Conta não encontrada." }, { status: 404 });

  return NextResponse.json({
    ok: true,
    user: { id: userId, name: profile.name, email: profile.email, role },
    account: { ...account, used_instances: usedInstances ?? 0, available_instances: Math.max(0, Number(account.instance_limit || 0) - Number(usedInstances || 0)) },
  });
}
