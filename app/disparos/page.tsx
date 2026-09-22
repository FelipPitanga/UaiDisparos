import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireTenantId } from "@/lib/tenant";
import DisparosManager from "./DisparosManager";

export const dynamic = "force-dynamic";

export default async function DisparosPage() {
  const accountId = requireTenantId();
  const supabase = getSupabaseAdmin();

  const [campaignsResult, sendersResult, groupsResult] = await Promise.all([
    supabase.from("campaigns").select("id,name,text_content").eq("account_id", accountId).eq("status", "active").order("created_at", { ascending: false }),
    supabase.from("instances").select("id,name,status,phone").eq("account_id", accountId).eq("instance_role", "sender").order("created_at", { ascending: true }),
    supabase.from("groups").select("id,name,external_id,member_count,monitoring_enabled,metadata").eq("account_id", accountId).order("name", { ascending: true }),
  ]);

  return (
    <DisparosManager
      campaigns={(campaignsResult.data ?? []) as any}
      senders={(sendersResult.data ?? []) as any}
      groups={(groupsResult.data ?? []) as any}
    />
  );
}
