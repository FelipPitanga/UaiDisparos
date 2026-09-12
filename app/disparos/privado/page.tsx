import { getSupabaseAdmin } from "@/lib/supabase/server";
import PrivateBroadcastManager from "./PrivateBroadcastManager";

export const dynamic = "force-dynamic";

export default async function PrivateBroadcastPage() {
  const supabase = getSupabaseAdmin();
  const [campaignsResult, sendersResult, groupsResult, leadsResult] = await Promise.all([
    supabase.from("campaigns").select("id,name,text_content").eq("status", "active").order("created_at", { ascending: false }),
    supabase.from("instances").select("id,name,status,phone").eq("instance_role", "sender").order("created_at", { ascending: true }),
    supabase.from("groups").select("id,name,external_id").order("name", { ascending: true }),
    supabase.from("leads").select("id,phone,name,group_id,consent_status").eq("consent_status", "opt_in").not("phone", "is", null),
  ]);

  const campaigns = campaignsResult.data ?? [];
  const senders = sendersResult.data ?? [];
  const rawGroups = groupsResult.data ?? [];
  const leads = leadsResult.data ?? [];

  const grouped = new Map<string, { id: string; name: string | null; external_id: string; ids: string[] }>();
  for (const group of rawGroups) {
    const key = group.external_id || group.id;
    const current = grouped.get(key);
    if (current) {
      current.ids.push(group.id);
      if (!current.name && group.name) current.name = group.name;
    } else {
      grouped.set(key, { id: group.id, name: group.name, external_id: group.external_id, ids: [group.id] });
    }
  }
  const groups = Array.from(grouped.values()).sort((a, b) => (a.name || a.external_id).localeCompare(b.name || b.external_id, "pt-BR"));

  return (
    <PrivateBroadcastManager
      campaigns={campaigns as any}
      senders={senders as any}
      groups={groups as any}
      authorizedLeads={leads as any}
    />
  );
}
