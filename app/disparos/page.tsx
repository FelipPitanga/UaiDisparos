import { getSupabaseAdmin } from "@/lib/supabase/server";
import DisparosManager from "./DisparosManager";
import LiveRefresh from "./LiveRefresh";

export const dynamic = "force-dynamic";

export default async function DisparosPage() {
  const supabase = getSupabaseAdmin();

  const [campaignsResult, sendersResult, groupsResult, automationsResult, jobsResult] = await Promise.all([
    supabase.from("campaigns").select("id,name,text_content").eq("status", "active").order("created_at", { ascending: false }),
    supabase.from("instances").select("id,name,status,phone").eq("instance_role", "sender").order("created_at", { ascending: true }),
    supabase.from("groups").select("id,name,external_id,monitoring_enabled").order("name", { ascending: true }),
    supabase.from("group_automations").select("id,group_id,campaign_id,sender_instance_id,campaign_ids,sender_instance_ids,delay_seconds,send_interval_seconds,daily_limit_per_sender,active,authorization_confirmed").order("created_at", { ascending: false }),
    supabase.from("jobs").select("id,recipient,status,error_message,created_at,scheduled_at,processed_at,campaign_id,group_id,instance_id").order("created_at", { ascending: false }).limit(100),
  ]);

  const campaigns = campaignsResult.data ?? [];
  const senders = sendersResult.data ?? [];
  const groups = groupsResult.data ?? [];
  const automations = automationsResult.data ?? [];
  const jobs = jobsResult.data ?? [];

  const campaignMap = new Map(campaigns.map((x) => [x.id, x.name]));
  const groupMap = new Map(groups.map((x) => [x.id, x.name || x.external_id]));
  const senderMap = new Map(senders.map((x) => [x.id, x.name]));

  const jobsWithNames = jobs.map((job) => ({
    ...job,
    campaign_name: job.campaign_id ? campaignMap.get(job.campaign_id) : undefined,
    group_name: job.group_id ? groupMap.get(job.group_id) : undefined,
    sender_name: job.instance_id ? senderMap.get(job.instance_id) : undefined,
  }));

  return (
    <>
      <div className="row" style={{ justifyContent: "flex-end", marginBottom: 10 }}>
        <LiveRefresh intervalMs={1000} />
      </div>
      <DisparosManager
        campaigns={campaigns as any}
        senders={senders as any}
        groups={groups as any}
        automations={automations as any}
        jobs={jobsWithNames as any}
      />
    </>
  );
}
