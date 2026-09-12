import { getSupabaseAdmin } from "@/lib/supabase/server";
import LiveRefresh from "./disparos/LiveRefresh";

export const dynamic = "force-dynamic";

async function count(table: string, filters?: (q: any) => any) {
  const supabase = getSupabaseAdmin();
  let query = supabase.from(table).select("*", { count: "exact", head: true });
  if (filters) query = filters(query);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export default async function Page() {
  const supabase = getSupabaseAdmin();
  const today = new Date();
  today.setHours(0,0,0,0);
  const todayIso = today.toISOString();

  const [groupSent, privateSent, activeGroupOps, activePrivateOps, groupFailed, privateFailed, eventsResult] = await Promise.all([
    count("jobs", q => q.eq("status","sent").gte("processed_at", todayIso)),
    count("private_broadcast_recipients", q => q.eq("status","sent").gte("processed_at", todayIso)),
    count("group_automations", q => q.eq("active", true)),
    count("private_broadcasts", q => q.eq("status","active")),
    count("jobs", q => q.eq("status","failed").gte("updated_at", todayIso)),
    count("private_broadcast_recipients", q => q.eq("status","failed").gte("updated_at", todayIso)),
    supabase.from("webhook_events").select("id,event_type,processed,processing_error,received_at,group_external_id").order("received_at", { ascending:false }).limit(6),
  ]);

  const sent = groupSent + privateSent;
  const activeOps = activeGroupOps + activePrivateOps;
  const failed = groupFailed + privateFailed;
  const processed = Math.max(1, sent + failed);
  const successRate = Math.max(0, Math.round((sent / processed) * 1000) / 10);

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
        <div className="overview-kpi"><div className="label">Mensagens enviadas</div><div className="metric">{sent.toLocaleString("pt-BR")}</div><div className="overview-trend">↑ operação ativa</div></div>
        <div className="overview-kpi"><div className="label">Taxa de sucesso</div><div className="metric">{successRate}%</div><div className="overview-trend">↑ envios concluídos</div></div>
        <div className="overview-kpi"><div className="label">Operações ativas</div><div className="metric">{activeOps}</div><div className="overview-trend">↑ grupo + privado</div></div>
      </div>

      <div className="overview-chart">
        <div className="label" style={{color:"#D7D0C5"}}><span className="overview-live-dot"/>Crescimento consistente</div>
        <svg viewBox="0 0 760 220" preserveAspectRatio="none" aria-hidden="true">
          <defs><linearGradient id="overviewFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#E7B34E" stopOpacity=".22"/><stop offset="1" stopColor="#E7B34E" stopOpacity="0"/></linearGradient></defs>
          <line className="chart-grid" x1="0" y1="55" x2="760" y2="55"/><line className="chart-grid" x1="0" y1="110" x2="760" y2="110"/><line className="chart-grid" x1="0" y1="165" x2="760" y2="165"/>
          <path className="chart-area" d="M0 176 C70 150 105 123 160 138 S265 176 335 117 S425 144 482 102 S560 83 610 72 S682 46 760 35 L760 220 L0 220 Z"/>
          <path className="chart-line" d="M0 176 C70 150 105 123 160 138 S265 176 335 117 S425 144 482 102 S560 83 610 72 S682 46 760 35"/>
        </svg>
        <div className="overview-chart-labels"><span>Seg</span><span>Ter</span><span>Qua</span><span>Qui</span><span>Sex</span><span>Sáb</span><span>Dom</span></div>
      </div>
    </section>

    <div className="section">
      <div className="section-title">Atividade recente</div>
      <div className="table-wrap">
        <table><thead><tr><th>Evento</th><th>Origem</th><th>Status</th><th>Horário</th></tr></thead><tbody>
          {(eventsResult.data ?? []).map((event:any)=><tr key={event.id}><td>{event.event_type || "Webhook"}</td><td>{event.group_external_id || "UAZAPI"}</td><td><span className={`status-chip`}><span className={`status-dot ${event.processing_error ? "failed" : event.processed ? "sent" : "processing"}`}/>{event.processing_error ? "Falhou" : event.processed ? "Enviado" : "Em processamento"}</span></td><td>{new Date(event.received_at).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</td></tr>)}
          {!eventsResult.data?.length ? <tr><td colSpan={4}>Nenhum evento recente.</td></tr> : null}
        </tbody></table>
      </div>
    </div>
  </>;
}
