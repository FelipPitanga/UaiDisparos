import { Smartphone, Users, UserRound, Megaphone, Send, TriangleAlert } from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import LiveRefresh from "./disparos/LiveRefresh";

export const dynamic = "force-dynamic";

async function getCount(table: string, filters?: (q: any) => any) {
  const supabase = getSupabaseAdmin();
  let query = supabase.from(table).select("*", { count: "exact", head: true });
  if (filters) query = filters(query);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function getDashboardData() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString();

    const [connectedInstances, monitoredGroups, leads, activeCampaigns, processedToday, errorsToday] = await Promise.all([
      getCount("instances", (q) => q.eq("status", "connected")),
      getCount("groups", (q) => q.eq("monitoring_enabled", true)),
      getCount("leads"),
      getCount("campaigns", (q) => q.eq("status", "active")),
      getCount("jobs", (q) => q.eq("status", "sent").gte("processed_at", todayIso)),
      getCount("jobs", (q) => q.eq("status", "failed").gte("updated_at", todayIso)),
    ]);

    const supabase = getSupabaseAdmin();
    const { data: events, error } = await supabase
      .from("webhook_events")
      .select("id,event_type,provider,processed,processing_error,received_at,group_external_id")
      .order("received_at", { ascending: false })
      .limit(8);

    if (error) throw error;

    return {
      ok: true as const,
      metrics: [
        ["Instâncias conectadas", String(connectedInstances), Smartphone],
        ["Grupos monitorados", String(monitoredGroups), Users],
        ["Leads capturados", leads.toLocaleString("pt-BR"), UserRound],
        ["Campanhas ativas", String(activeCampaigns), Megaphone],
        ["Processados hoje", String(processedToday), Send],
        ["Erros hoje", String(errorsToday), TriangleAlert],
      ],
      events: events ?? [],
    };
  } catch (error: any) {
    return {
      ok: false as const,
      error: error?.message || "Falha ao consultar o Supabase",
      metrics: [
        ["Instâncias conectadas", "—", Smartphone],
        ["Grupos monitorados", "—", Users],
        ["Leads capturados", "—", UserRound],
        ["Campanhas ativas", "—", Megaphone],
        ["Processados hoje", "—", Send],
        ["Erros hoje", "—", TriangleAlert],
      ],
      events: [],
    };
  }
}

function relativeTime(dateString: string) {
  const diff = Date.now() - new Date(dateString).getTime();
  const minutes = Math.max(0, Math.floor(diff / 60000));
  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return new Date(dateString).toLocaleString("pt-BR");
}

export default async function Page() {
  const data = await getDashboardData();

  return <>
    <div className="row" style={{ justifyContent: "flex-end", marginBottom: 10 }}>
      <LiveRefresh intervalMs={1000} />
    </div>
    <div className="topbar">
      <div>
        <h1>Dashboard</h1>
        <div className="subtitle">Visão geral da operação do UaiDisparos.</div>
      </div>
      <span className={`badge ${data.ok ? "ok" : "bad"}`}>
        ● {data.ok ? "Supabase conectado" : "Supabase desconectado"}
      </span>
    </div>

    {!data.ok && (
      <div className="section">
        <div className="card">
          <div className="label">Conexão com banco</div>
          <div style={{ marginTop: 10 }}>
            Não foi possível consultar o Supabase: <strong>{data.error}</strong>
          </div>
          <div className="subtitle" style={{ marginTop: 8 }}>
            Configure SUPABASE_SECRET_KEY ou SUPABASE_SERVICE_ROLE_KEY no .env.local e reinicie o Next.js.
          </div>
        </div>
      </div>
    )}

    <div className="grid">
      {data.metrics.map(([label, value, Icon]: any) => (
        <div className="card" key={label}>
          <div className="row"><div className="label">{label}</div><div className="kpi-icon"><Icon size={18}/></div></div>
          <div className="metric">{value}</div>
        </div>
      ))}
    </div>

    <div className="section">
      <div className="section-title">Atividade recente</div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Evento</th><th>Origem</th><th>Status</th><th>Horário</th></tr></thead>
          <tbody>
            {data.events.length === 0 ? (
              <tr><td colSpan={4}>Nenhum evento real recebido ainda.</td></tr>
            ) : data.events.map((event: any) => (
              <tr key={event.id}>
                <td>{event.event_type || "Webhook recebido"}</td>
                <td>{event.group_external_id || event.provider || "UAZAPI"}</td>
                <td><span className={`badge ${event.processing_error ? "bad" : event.processed ? "ok" : "warn"}`}>{event.processing_error ? "erro" : event.processed ? "processado" : "pendente"}</span></td>
                <td>{relativeTime(event.received_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </>;
}
