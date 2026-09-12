import { Smartphone, Users, UserRound, Megaphone, Send, TriangleAlert, RadioTower, Zap } from "lucide-react";
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

    const [
      connectedInstances,
      monitoredGroups,
      leads,
      activeCampaigns,
      groupSent,
      privateSent,
      groupErrors,
      privateErrors,
      activeGroupOps,
      activePrivateOps,
    ] = await Promise.all([
      getCount("instances", (q) => q.eq("status", "connected")),
      getCount("groups", (q) => q.eq("monitoring_enabled", true)),
      getCount("leads"),
      getCount("campaigns", (q) => q.eq("status", "active")),
      getCount("jobs", (q) => q.eq("status", "sent").gte("processed_at", todayIso)),
      getCount("private_broadcast_recipients", (q) => q.eq("status", "sent").gte("processed_at", todayIso)),
      getCount("jobs", (q) => q.eq("status", "failed").gte("updated_at", todayIso)),
      getCount("private_broadcast_recipients", (q) => q.eq("status", "failed").gte("updated_at", todayIso)),
      getCount("group_automations", (q) => q.eq("active", true)),
      getCount("private_broadcasts", (q) => q.eq("status", "active")),
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
      processedToday: groupSent + privateSent,
      activeOperations: activeGroupOps + activePrivateOps,
      metrics: [
        ["Instâncias conectadas", String(connectedInstances), Smartphone, "rede online"],
        ["Grupos monitorados", String(monitoredGroups), Users, "captura ativa"],
        ["Leads capturados", leads.toLocaleString("pt-BR"), UserRound, "base acumulada"],
        ["Campanhas ativas", String(activeCampaigns), Megaphone, "prontas para rodar"],
        ["Processados hoje", String(groupSent + privateSent), Send, "grupo + privado"],
        ["Erros hoje", String(groupErrors + privateErrors), TriangleAlert, "requer atenção"],
      ],
      events: events ?? [],
    };
  } catch (error: any) {
    return {
      ok: false as const,
      error: error?.message || "Falha ao consultar o Supabase",
      processedToday: 0,
      activeOperations: 0,
      metrics: [
        ["Instâncias conectadas", "—", Smartphone, "indisponível"],
        ["Grupos monitorados", "—", Users, "indisponível"],
        ["Leads capturados", "—", UserRound, "indisponível"],
        ["Campanhas ativas", "—", Megaphone, "indisponível"],
        ["Processados hoje", "—", Send, "indisponível"],
        ["Erros hoje", "—", TriangleAlert, "indisponível"],
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

function HeroMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id="heroGold" x1="5" y1="5" x2="42" y2="43">
          <stop stopColor="#f5cf80" />
          <stop offset=".58" stopColor="#e7b34e" />
          <stop offset="1" stopColor="#c46a3f" />
        </linearGradient>
      </defs>
      <path d="M7 15.8 41.5 5.9 27.8 41 21.5 27.2 7 15.8Z" fill="url(#heroGold)" />
      <path d="m14.5 17.1 20.7-6.3-14.7 12.9-6-6.6Z" fill="#f7f4ed" fillOpacity=".9" />
      <path d="m21.2 26 12.5-10.9-8.4 20.3-4.1-9.4Z" fill="#2e5d3a" />
      <path d="m7.2 30.5 10.5-3.8 4.1 8.8-5.6 6.6-9-11.6Z" fill="#e7b34e" />
    </svg>
  );
}

export default async function Page() {
  const data = await getDashboardData();

  return <>
    <div className="row" style={{ justifyContent: "flex-end", marginBottom: 10 }}>
      <LiveRefresh intervalMs={1000} />
    </div>

    <section className="brand-hero">
      <div className="brand-hero-copy">
        <div className="brand-kicker">UAI DISPAROS • CENTRO-OESTE</div>
        <h2>Disparo certo.<br/>Escala real.</h2>
        <p>Controle sua operação em tempo real, conecte grupos, campanhas e contas e acompanhe cada envio com a identidade do Cerrado.</p>
        <div className="hero-pills">
          <span><RadioTower size={12} /> {data.activeOperations} operações ativas</span>
          <span><Zap size={12} /> {data.processedToday} processados hoje</span>
          <span>{data.ok ? "● infraestrutura online" : "● revisar infraestrutura"}</span>
        </div>
      </div>
      <div className="hero-visual">
        <div className="hero-orbit"><HeroMark /></div>
      </div>
    </section>

    {!data.ok ? (
      <div className="alert-error">Não foi possível consultar o Supabase: <strong>{data.error}</strong></div>
    ) : null}

    <div className="grid" style={{ marginTop: 18 }}>
      {data.metrics.map(([label, value, Icon, hint]: any) => (
        <div className="card" key={label}>
          <span className="stat-accent" />
          <div className="row"><div className="label">{label}</div><div className="kpi-icon"><Icon size={18}/></div></div>
          <div className="metric">{value}</div>
          <div className="trend">{hint}</div>
        </div>
      ))}
    </div>

    <div className="section" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.15fr) minmax(340px,.85fr)", gap: 14 }}>
      <div className="card dashboard-chart">
        <div className="row"><div><div className="section-title" style={{ marginBottom: 4 }}>Ritmo da operação</div><div className="muted">Visão visual da cadência operacional</div></div><span className="badge ok">crescimento consistente</span></div>
        <svg viewBox="0 0 760 160" preserveAspectRatio="none" aria-hidden="true">
          <defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e7b34e" stopOpacity=".24"/><stop offset="1" stopColor="#e7b34e" stopOpacity="0"/></linearGradient></defs>
          <line className="chart-grid-line" x1="0" y1="35" x2="760" y2="35"/><line className="chart-grid-line" x1="0" y1="80" x2="760" y2="80"/><line className="chart-grid-line" x1="0" y1="125" x2="760" y2="125"/>
          <path className="chart-area" d="M0 128 C80 118 115 93 180 99 S290 120 350 80 S455 58 520 66 S630 43 760 24 L760 160 L0 160 Z" />
          <path className="chart-line" d="M0 128 C80 118 115 93 180 99 S290 120 350 80 S455 58 520 66 S630 43 760 24" />
        </svg>
        <div className="chart-labels"><span>Seg</span><span>Ter</span><span>Qua</span><span>Qui</span><span>Sex</span><span>Sáb</span><span>Dom</span></div>
      </div>

      <div className="card">
        <div className="row"><div><div className="section-title" style={{ marginBottom: 4 }}>Pulso do sistema</div><div className="muted">Sincronização contínua</div></div><span className={`badge ${data.ok ? "ok" : "bad"}`}>{data.ok ? "Online" : "Offline"}</span></div>
        <div style={{ marginTop: 18, display: "grid", gap: 11 }}>
          <div className="selector-card selected"><span><strong>Webhook de grupos</strong><small>Captura de novos leads em tempo real</small></span><span className="badge ok">ativo</span></div>
          <div className="selector-card selected"><span><strong>Fila em nuvem</strong><small>Processamento independente do navegador</small></span><span className="badge ok">ativo</span></div>
          <div className="selector-card selected"><span><strong>Monitoramento de contas</strong><small>Status e restrições observados continuamente</small></span><span className="badge ok">ativo</span></div>
        </div>
      </div>
    </div>

    <div className="section">
      <div className="row" style={{ marginBottom: 12 }}><div><div className="section-title" style={{ marginBottom: 4 }}>Atividade recente</div><div className="muted">Eventos mais novos recebidos pela operação</div></div><span className="badge">ao vivo</span></div>
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
