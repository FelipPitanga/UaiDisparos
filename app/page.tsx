import { getSupabaseAdmin } from "@/lib/supabase/server";
import LiveRefresh from "./disparos/LiveRefresh";
import LiveOverviewChart from "./components/LiveOverviewChart";

export const dynamic = "force-dynamic";

const TIME_ZONE = "America/Sao_Paulo";

async function count(table: string, filters?: (q: any) => any) {
  const supabase = getSupabaseAdmin();
  let query = supabase.from(table).select("*", { count: "exact", head: true });
  if (filters) query = filters(query);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

function dayKey(value: string | Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(typeof value === "string" ? new Date(value) : value);
}

function shortDay(value: Date) {
  const text = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    weekday: "short",
  }).format(value);
  return text.replace(".", "").replace(/^./, (c) => c.toUpperCase());
}

function buildLast7Days() {
  const now = new Date();
  const days: { key: string; label: string }[] = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(now.getTime() - offset * 24 * 60 * 60 * 1000);
    days.push({ key: dayKey(date), label: shortDay(date) });
  }
  return days;
}

export default async function Page() {
  const supabase = getSupabaseAdmin();
  const days = buildLast7Days();
  const validDayKeys = new Set(days.map((day) => day.key));
  const queryCutoff = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();

  const [
    groupSentRows,
    privateSentRows,
    groupFailedRows,
    privateFailedRows,
    activeGroupOps,
    activePrivateOps,
    eventsResult,
  ] = await Promise.all([
    supabase.from("jobs").select("processed_at").eq("status", "sent").gte("processed_at", queryCutoff),
    supabase.from("private_broadcast_recipients").select("processed_at").eq("status", "sent").gte("processed_at", queryCutoff),
    supabase.from("jobs").select("updated_at").eq("status", "failed").gte("updated_at", queryCutoff),
    supabase.from("private_broadcast_recipients").select("updated_at").eq("status", "failed").gte("updated_at", queryCutoff),
    count("group_automations", q => q.eq("active", true)),
    count("private_broadcasts", q => q.eq("status", "active")),
    supabase.from("webhook_events").select("id,event_type,processed,processing_error,received_at,group_external_id").order("received_at", { ascending:false }).limit(6),
  ]);

  const sentPerDay = new Map(days.map((day) => [day.key, 0]));
  for (const row of [...(groupSentRows.data ?? []), ...(privateSentRows.data ?? [])]) {
    if (!row.processed_at) continue;
    const key = dayKey(row.processed_at);
    if (validDayKeys.has(key)) sentPerDay.set(key, (sentPerDay.get(key) ?? 0) + 1);
  }

  const failedRows = [...(groupFailedRows.data ?? []), ...(privateFailedRows.data ?? [])];
  const failedLast7 = failedRows.filter((row: any) => row.updated_at && validDayKeys.has(dayKey(row.updated_at))).length;
  const chartValues = days.map((day) => sentPerDay.get(day.key) ?? 0);
  const sentLast7 = chartValues.reduce((sum, value) => sum + value, 0);
  const activeOps = activeGroupOps + activePrivateOps;
  const processed = sentLast7 + failedLast7;
  const successRate = processed ? Math.round((sentLast7 / processed) * 1000) / 10 : 100;
  const latestDayCount = chartValues.at(-1) ?? 0;
  const chartData = days.map((day, index) => ({ ...day, value: chartValues[index] }));

  return <>
    <div className="row" style={{justifyContent:"flex-end",marginBottom:10}}><LiveRefresh intervalMs={1000}/></div>

    <section className="overview-shell">
      <div className="overview-head">
        <div>
          <h1>Visão geral</h1>
          <div className="subtitle">Acompanhe o ritmo da operação UAI Disparos em tempo real.</div>
        </div>
        <div className="overview-period">▣ Últimos 7 dias⌄</div>
      </div>

      <div className="overview-kpis">
        <div className="overview-kpi"><div className="label">Mensagens enviadas</div><div className="metric">{sentLast7.toLocaleString("pt-BR")}</div><div className="overview-trend">↑ últimos 7 dias</div></div>
        <div className="overview-kpi"><div className="label">Taxa de sucesso</div><div className="metric">{successRate}%</div><div className="overview-trend">↑ envios concluídos</div></div>
        <div className="overview-kpi"><div className="label">Operações ativas</div><div className="metric">{activeOps}</div><div className="overview-trend">↑ grupo + privado</div></div>
      </div>

      <LiveOverviewChart data={chartData} latestValue={latestDayCount} />
    </section>

    <div className="section">
      <div className="section-title">Atividade recente</div>
      <div className="table-wrap">
        <table><thead><tr><th>Evento</th><th>Origem</th><th>Status</th><th>Horário</th></tr></thead><tbody>
          {(eventsResult.data ?? []).map((event:any)=><tr key={event.id}><td>{event.event_type || "Webhook"}</td><td>{event.group_external_id || "UAZAPI"}</td><td><span className="status-chip"><span className={`status-dot ${event.processing_error ? "failed" : event.processed ? "sent" : "processing"}`}/>{event.processing_error ? "Falhou" : event.processed ? "Enviado" : "Em processamento"}</span></td><td>{new Date(event.received_at).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit",timeZone:TIME_ZONE})}</td></tr>)}
          {!eventsResult.data?.length ? <tr><td colSpan={4}>Nenhum evento recente.</td></tr> : null}
        </tbody></table>
      </div>
    </div>
  </>;
}
