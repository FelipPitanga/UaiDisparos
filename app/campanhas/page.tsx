import { getSupabaseAdmin } from "@/lib/supabase/server";
import CampaignsManager from "./CampaignsManager";

export const dynamic = "force-dynamic";

export default async function Page() {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("campaigns")
    .select("id,name,status,text_content,media_url,media_type,footer_text,buttons,created_at,updated_at")
    .order("created_at", { ascending: false });

  return <CampaignsManager initialCampaigns={(data ?? []) as any} />;
}
