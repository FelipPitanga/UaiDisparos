import { getSupabaseAdmin } from "@/lib/supabase/server";
import InstancesManager from "./InstancesManager";
import InstanceHealthPanel from "./InstanceHealthPanel";

export const dynamic = "force-dynamic";

export default async function Page() {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("instances")
    .select("id,name,status,instance_role,phone,last_seen_at,created_at,send_blocked_until,send_block_reason,send_block_code")
    .order("created_at", { ascending: false });

  const instances = (data ?? []) as any[];

  return (
    <>
      <InstanceHealthPanel instances={instances as any} />
      <InstancesManager initialInstances={instances as any} />
    </>
  );
}
