import { getSupabaseAdmin } from "@/lib/supabase/server";
import InstancesManager from "./InstancesManager";

export const dynamic = "force-dynamic";

export default async function Page() {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("instances")
    .select("id,name,status,instance_role,phone,last_seen_at,created_at")
    .order("created_at", { ascending: false });

  return <InstancesManager initialInstances={(data ?? []) as any} />;
}
