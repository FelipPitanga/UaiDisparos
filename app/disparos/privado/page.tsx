import { getSupabaseAdmin } from "@/lib/supabase/server";
import PrivateBroadcastManager from "./PrivateBroadcastManager";
import LiveRefresh from "../LiveRefresh";

export const dynamic = "force-dynamic";

export default async function PrivateBroadcastPage() {
  const supabase = getSupabaseAdmin();
  const [campaignsResult, sendersResult, groupsResult, leadsResult, broadcastsResult, recipientsResult] = await Promise.all([
    supabase.from("campaigns").select("id,name,text_content").eq("status", "active").order("created_at", { ascending: false }),
    supabase.from("instances").select("id,name,status,phone").eq("instance_role", "sender").order("created_at", { ascending: true }),
    supabase.from("groups").select("id,name,external_id").order("name", { ascending: true }),
    supabase.from("leads").select("id,phone,name,group_id,consent_status").eq("consent_status", "opt_in").not("phone", "is", null),
    supabase.from("private_broadcasts").select("*").neq("status", "archived").order("created_at", { ascending: false }).limit(50),
    supabase.from("private_broadcast_recipients").select("id,broadcast_id,phone,status,error_message,processed_at,scheduled_at,campaign_id,instance_id").order("created_at", { ascending: false }).limit(150),
  ]);

  const campaigns = campaignsResult.data ?? [];
  const senders = sendersResult.data ?? [];
  const rawGroups = groupsResult.data ?? [];
  const leads = leadsResult.data ?? [];
  const broadcasts = broadcastsResult.data ?? [];
  const recipients = recipientsResult.data ?? [];

  const grouped = new Map<string, { id: string; name: string | null; external_id: string; ids: string[] }>();
  for (const group of rawGroups) {
    const key = group.external_id || group.id;
    const current = grouped.get(key);
    if (current) {
      current.ids.push(group.id);
      if (!current.name && group.name) current.name = group.name;
    } else {
      grouped.set(key, {
        id: group.id,
        name: group.name,
        external_id: group.external_id,
        ids: [group.id],
      });
    }
  }
  const groups = Array.from(grouped.values()).sort((a, b) => (a.name || a.external_id).localeCompare(b.name || b.external_id, "pt-BR"));

  const campaignMap = new Map(campaigns.map((x) => [x.id, x.name]));
  const senderMap = new Map(senders.map((x) => [x.id, x.name]));
  const broadcastMap = new Map(broadcasts.map((x) => [x.id, x.name]));
  const recipientsWithNames = recipients.map((row) => ({
    ...row,
    broadcast_name: broadcastMap.get(row.broadcast_id) || "Disparo privado",
    campaign_name: row.campaign_id ? campaignMap.get(row.campaign_id) : undefined,
    sender_name: row.instance_id ? senderMap.get(row.instance_id) : undefined,
  }));

  return (
    <>
      <div className="row" style={{ justifyContent: "flex-end", marginBottom: 10 }}>
        <LiveRefresh intervalMs={1000} />
      </div>
      <PrivateBroadcastManager
        campaigns={campaigns as any}
        senders={senders as any}
        groups={groups as any}
        authorizedLeads={leads as any}
        broadcasts={broadcasts as any}
        recipients={recipientsWithNames as any}
      />
    </>
  );
}
