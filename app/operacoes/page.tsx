import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireTenantId } from "@/lib/tenant";
import LiveRefresh from "../disparos/LiveRefresh";
import OperationsManager from "./OperationsManager";

export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  const accountId = requireTenantId();
  const supabase = getSupabaseAdmin();

  const [groupOpsResult, privateOpsResult, campaignsResult, instancesResult, groupsResult] = await Promise.all([
    supabase.from("group_automations").select("id,group_id,campaign_id,campaign_ids,sender_instance_id,sender_instance_ids,active,created_at").eq("account_id", accountId).order("created_at", { ascending: false }),
    supabase.from("private_broadcasts").select("id,name,campaign_ids,sender_instance_ids,status,created_at").eq("account_id", accountId).neq("status", "archived").order("created_at", { ascending: false }),
    supabase.from("campaigns").select("id,name").eq("account_id", accountId),
    supabase.from("instances").select("id,name,phone,status").eq("account_id", accountId),
    supabase.from("groups").select("id,name,external_id").eq("account_id", accountId),
  ]);

  const groupOps = groupOpsResult.data ?? [];
  const privateOps = privateOpsResult.data ?? [];
  const campaigns = campaignsResult.data ?? [];
  const instances = instancesResult.data ?? [];
  const groups = groupsResult.data ?? [];

  const groupOpIds = groupOps.map((x) => x.id);
  const privateOpIds = privateOps.map((x) => x.id);

  const [jobsResult, recipientsResult] = await Promise.all([
    groupOpIds.length
      ? supabase.from("jobs").select("id,automation_id,recipient,status,error_message,processed_at,scheduled_at,campaign_id,instance_id,created_at").eq("account_id", accountId).in("automation_id", groupOpIds).order("created_at", { ascending: false }).limit(2000)
      : Promise.resolve({ data: [] as any[] }),
    privateOpIds.length
      ? supabase.from("private_broadcast_recipients").select("id,broadcast_id,phone,status,error_message,processed_at,scheduled_at,campaign_id,instance_id,created_at").eq("account_id", accountId).in("broadcast_id", privateOpIds).order("created_at", { ascending: false }).limit(2000)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const jobs = jobsResult.data ?? [];
  const recipients = recipientsResult.data ?? [];
  const campaignMap = new Map(campaigns.map((x) => [x.id, x]));
  const instanceMap = new Map(instances.map((x) => [x.id, x]));
  const groupMap = new Map(groups.map((x) => [x.id, x]));

  const operations: any[] = [];

  for (const op of groupOps) {
    const campaignIds = op.campaign_ids?.length ? op.campaign_ids : op.campaign_id ? [op.campaign_id] : [];
    const senderIds = op.sender_instance_ids?.length ? op.sender_instance_ids : op.sender_instance_id ? [op.sender_instance_id] : [];
    const group = groupMap.get(op.group_id);
    operations.push({
      id: op.id,
      type: "group",
      title: group?.name || group?.external_id || "Disparo em grupo",
      subtitle: "Automação por entrada de novos leads",
      active: Boolean(op.active),
      campaigns: campaignIds.map((id: string) => campaignMap.get(id)).filter(Boolean),
      senders: senderIds.map((id: string) => instanceMap.get(id)).filter(Boolean),
      contacts: jobs.filter((job) => job.automation_id === op.id).map((job) => ({
        id: job.id,
        phone: job.recipient,
        status: job.status,
        campaign_name: job.campaign_id ? campaignMap.get(job.campaign_id)?.name || null : null,
        sender_name: job.instance_id ? instanceMap.get(job.instance_id)?.name || null : null,
        detail: job.error_message,
        processed_at: job.processed_at,
        scheduled_at: job.scheduled_at,
      })),
    });
  }

  for (const op of privateOps) {
    operations.push({
      id: op.id,
      type: "private",
      title: op.name || "Disparo privado",
      subtitle: "Lista privada de contatos",
      active: op.status === "active",
      campaigns: (op.campaign_ids || []).map((id: string) => campaignMap.get(id)).filter(Boolean),
      senders: (op.sender_instance_ids || []).map((id: string) => instanceMap.get(id)).filter(Boolean),
      contacts: recipients.filter((row) => row.broadcast_id === op.id).map((row) => ({
        id: row.id,
        phone: row.phone,
        status: row.status,
        campaign_name: row.campaign_id ? campaignMap.get(row.campaign_id)?.name || null : null,
        sender_name: row.instance_id ? instanceMap.get(row.instance_id)?.name || null : null,
        detail: row.error_message,
        processed_at: row.processed_at,
        scheduled_at: row.scheduled_at,
      })),
    });
  }

  return (
    <>
      <div className="row" style={{ justifyContent: "flex-end", marginBottom: 10 }}>
        <LiveRefresh intervalMs={1000} />
      </div>
      <OperationsManager operations={operations as any} />
    </>
  );
}
