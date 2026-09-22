import { getSupabaseSession } from "@/lib/supabase/session";
import NotificationSettingsForm from "./NotificationSettingsForm";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const supabase = getSupabaseSession();
  const { data } = await supabase
    .from("notification_settings")
    .select("group_sent_url,private_sent_url,disconnected_url")
    .eq("id", 1)
    .maybeSingle();

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Notificações</h1>
          <div className="subtitle">Webhooks Pushcut para acompanhar envios e quedas das instâncias.</div>
        </div>
      </div>

      <NotificationSettingsForm
        initialSettings={{
          group_sent_url: data?.group_sent_url ?? null,
          private_sent_url: data?.private_sent_url ?? null,
          disconnected_url: data?.disconnected_url ?? null,
        }}
      />
    </>
  );
}
