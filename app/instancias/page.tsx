import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireTenantId } from "@/lib/tenant";
import InstancesManager from "./InstancesManager";
import InstanceHealthPanel from "./InstanceHealthPanel";
import LiveRefresh from "../disparos/LiveRefresh";

export const dynamic = "force-dynamic";

export default async function Page() {
  const accountId = requireTenantId();
  const supabase = getSupabaseAdmin();

  const [{ data }, { data: account }] = await Promise.all([
    supabase
      .from("instances")
      .select("id,name,status,instance_role,phone,last_seen_at,created_at,send_blocked_until,send_block_reason,send_block_code")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false }),
    supabase
      .from("accounts")
      .select("instance_limit")
      .eq("id", accountId)
      .single(),
  ]);

  const instances = (data ?? []) as any[];
  const limit = Number(account?.instance_limit || 0);

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 10, gap: 12 }}>
        <div className="badge">
          Instâncias da conta: <strong style={{ marginLeft: 5 }}>{instances.length}/{limit}</strong>
          <span className="muted" style={{ marginLeft: 7 }}>• {Math.max(0, limit - instances.length)} disponíveis</span>
        </div>
        <LiveRefresh intervalMs={1000} />
      </div>
      <InstanceHealthPanel instances={instances as any} />
      <InstancesManager initialInstances={instances as any} />
    </>
  );
}
