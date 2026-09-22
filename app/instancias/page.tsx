import { getSupabaseSession } from "@/lib/supabase/session";
import { getTenantContext } from "@/lib/tenant";
import InstancesManager from "./InstancesManager";
import InstanceHealthPanel from "./InstanceHealthPanel";
import LiveRefresh from "../disparos/LiveRefresh";

export const dynamic = "force-dynamic";

export default async function Page() {
  const context = getTenantContext();
  const accountId = context.accountId;
  const supabase = getSupabaseSession();

  const [instancesResult, accountResult, profileResult] = await Promise.all([
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
    supabase
      .from("profiles")
      .select("permissions")
      .eq("user_id", context.userId)
      .maybeSingle(),
  ]);

  if (instancesResult.error) throw instancesResult.error;
  if (accountResult.error) throw accountResult.error;

  const instances = (instancesResult.data ?? []) as any[];
  const limit = Number(accountResult.data?.instance_limit || 0);
  const userPermissions = profileResult.data?.permissions && typeof profileResult.data.permissions === "object"
    ? profileResult.data.permissions as Record<string, boolean>
    : null;
  const connectorOnly = context.role !== "super_admin"
    && userPermissions?.overview === true
    && userPermissions?.instances === true
    && ["groups","leads","campaigns","group_broadcast","private_broadcast","operations","notifications","settings"]
      .every((key) => userPermissions?.[key] !== true);

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
      <InstancesManager initialInstances={instances as any} canChooseRole={!connectorOnly} />
    </>
  );
}
