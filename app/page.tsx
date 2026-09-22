import Link from "next/link";
import { Activity, Bell, Megaphone, RadioTower, Send, Smartphone, UserRound, Users } from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireTenantId } from "@/lib/tenant";
import LiveRefresh from "./disparos/LiveRefresh";
import LiveOverviewChart from "./components/LiveOverviewChart";

export const dynamic = "force-dynamic";

const TIME_ZONE = "America/Sao_Paulo";

async function count(table: string, accountId: string, filters?: (q: any) => any) {
  const supabase = getSupabaseAdmin();
  let query = supabase.from(table).select("*", { count: "exact", head: true }).eq("account_id", accountId);
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

function timeLabel(value: string | null) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function eventLabel(type: string | null) {
  if (!type) return "Webhook recebido";
  if (type === "participant_joined") return "Lead entrou no grupo";
  if (type === "participant_left") return "Participante saiu do grupo";
  return type.replaceAll("_", " ");
}

export default async function Page() {
  const accountId = requireTenantId();
  const supabase = getSupabaseAdmin();
  const days = buildLast7Days();
  const dayKeys = new Set(days.map((d) => d.key));
  const queryCutoff = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString();

  const [
    groupSentRows,
    privateSentRows,
    groupFailedRows,
    privateFailedRows,
    activeGroupOps,
    activePrivateOps,
    connectedInstances,
    monitoredGroups,
    leadsCount,
    activeCampaigns,
    groupQueued,
    privateQueued,
    groupProcessing,
    privateProcessing,
    groupSentToday,
    privateSentToday,
    groupFailedToday,
    privateFailedToday,
    eventsResult,
  ] = await Promise.all([
    supabase.from("jobs").select("processed_at").eq("account_id", accountId).eq("status", "sent").gte("processed_at", queryCutoff),
    supabase.from("private_broadcast_recipients").select("processed_at").eq("account_id", accountId).eq("status", "sent").gte("processed_at", queryCutoff),
    supabase.from("jobs").select("updated_at").eq("account_id", accountId).eq("status", "failed").gte("updated_at", queryCutoff),
    supabase.from("private_broadcast_recipients").select("updated_at").eq("account_id", accountId).eq("status", "failed").gte("updated_at", queryCutoff),
    count("group_automations", accountId, q => q.eq("active", true)),
    count("private_broadcasts", accountId, q => q.eq("status", "active")),
    count("instances", accountId, q => q.eq("status", "connected")),
    count("groups", accountId, q => q.eq("monitoring_enabled", true)),
    count("leads", accountId),
    count("campaigns", accountId, q => q.eq("status", "active")),
    count("jobs", accountId, q => q.eq("status", "queued")),
    count("private_broadcast_recipients", accountId, q => q.eq("status", "queued")),
    count("jobs", accountId, q => q.eq("status", "processing")),
    count("private_broadcast_recipients", accountId, q => q.eq("status", "processing")),
    count("jobs", accountId, q => q.eq("status", "sent").gte("processed_at", todayIso)),
    count("private_broadcast_recipients", accountId, q => q.eq("status", "sent").gte("processed_at", todayIso)),
    count("jobs", accountId, q => q.eq("status", "failed").gte("updated_at", todayIso)),
    count("private_broadcast_recipients", accountId, q => q.eq("status", "failed").gte("updated_at", todayIso)),
    supabase
      .from("webhook_events")
      .select("id,event_type,processed,processing_error,received_at,group_external_id")
      .eq("account_id", accountId)
      .order("received_at", { ascending: false })
      .limit(8),
  ]);

  const sentPerDay = new Map(days.map((day) => [day.key, 0]));
  for (const row of [...(groupSentRows.data ?? []), ...(privateSentRows.data ?? [])]) {
    if (!row.processed_at) continue;
    const key = dayKey(row.processed_at);
    if (dayKeys.has(key)) sentPerDay.set(key, (sentPerDay.get(key) ?? 0) + 1);
  }

  const sentValues = days.map((day) => sentPerDay.get(day.key) ?? 0);
  const sentLast7 = sentValues.reduce((sum, value) => sum + value, 0);
  const failedLast7 = [...(groupFailedRows.data ?? []), ...(privateFailedRows.data ?? [])]
    .filter((row: any) => row.updated_at && dayKeys.has(dayKey(row.updated_at))).length;
  const totalProcessed = sentLast7 + failedLast7;
  const successRate = totalProcessed ? Math.round((sentLast7 / totalProcessed) * 1000) / 10 : 100;
  const activeOps = activeGroupOps + activePrivateOps;
  const chartData = days.map((day, index) => ({ ...day, value: sentValues[index] }));

  const queueTotal = groupQueued + privateQueued;
  const processingTotal = groupProcessing + privateProcessing;
  const sentToday = groupSentToday + privateSentToday;
  const failedToday = groupFailedToday + privateFailedToday;

  return <>
    <LiveRefresh intervalMs={1000} />

    <section className="uai-overview-panel">
      <div className="uai-overview-topbar">
        <div><h1>Visão geral</h1></div>
        <div className="uai-overview-period">▣ Últimos 7 dias⌄</div>
      </div>

      <div className="uai-overview-kpis">
        <div className="uai-overview-kpi">
          <div className="uai-kpi-label">Mensagens enviadas</div>
          <div className="uai-kpi-value">{sentLast7.toLocaleString("pt-BR")}</div>
          <div className="uai-kpi-trend">↑ {sentLast7 > 0 ? "ao vivo" : "aguardando dados"}</div>
        </div>
        <div className="uai-overview-kpi">
          <div className="uai-kpi-label">Taxa de entrega</div>
          <div className="uai-kpi-value">{successRate.toLocaleString("pt-BR")}%</div>
          <div className="uai-kpi-trend">↑ envios concluídos</div>
        </div>
        <div className="uai-overview-kpi">
          <div className="uai-kpi-label">Operações ativas</div>
          <div className="uai-kpi-value">{activeOps}</div>
          <div className="uai-kpi-trend">↑ grupo + privado</div>
        </div>
      </div>

      <LiveOverviewChart data={chartData} />
    </section>

    <section className="dashboard-below">
      <div className="dashboard-section-head">
        <div>
          <div className="dashboard-section-kicker">OPERAÇÃO</div>
          <h2>Resumo operacional</h2>
          <p>O painel principal continua completo abaixo da visão geral.</p>
        </div>
        <Link href="/operacoes" className="dashboard-link">Abrir operações →</Link>
      </div>

      <div className="dashboard-stat-grid">
        {[
          ["Instâncias conectadas", connectedInstances, Smartphone, "/instancias", "contas online"],
          ["Grupos monitorados", monitoredGroups, Users, "/grupos", "captura ativa"],
          ["Leads capturados", leadsCount, UserRound, "/leads", "base acumulada"],
          ["Campanhas ativas", activeCampaigns, Megaphone, "/campanhas", "prontas para uso"],
        ].map(([label, value, Icon, href, hint]: any) => (
          <Link href={href} className="dashboard-stat-card" key={label}>
            <div className="dashboard-stat-top"><span>{label}</span><i><Icon size={17}/></i></div>
            <strong>{Number(value).toLocaleString("pt-BR")}</strong>
            <small>{hint}</small>
          </Link>
        ))}
      </div>

      <div className="dashboard-live-grid">
        <div className="dashboard-live-card">
          <div className="dashboard-live-card-head">
            <div><span className="dashboard-section-kicker">AO VIVO</span><h3>Fluxo de disparos</h3></div>
            <span className="badge ok">● sincronizado</span>
          </div>
          <div className="dashboard-flow-grid">
            <div><span className="status-dot queued"/><strong>{queueTotal}</strong><small>Aguardando</small></div>
            <div><span className="status-dot processing"/><strong>{processingTotal}</strong><small>Processando</small></div>
            <div><span className="status-dot sent"/><strong>{sentToday}</strong><small>Enviados hoje</small></div>
            <div><span className="status-dot failed"/><strong>{failedToday}</strong><small>Erros hoje</small></div>
          </div>
          <div className="dashboard-live-footer">
            <Link href="/disparos" className="dashboard-mini-action"><Send size={15}/> Disparo em grupo</Link>
            <Link href="/disparos/privado" className="dashboard-mini-action"><RadioTower size={15}/> Disparo privado</Link>
          </div>
        </div>

        <div className="dashboard-live-card">
          <div className="dashboard-live-card-head">
            <div><span className="dashboard-section-kicker">SISTEMA</span><h3>Saúde da operação</h3></div>
            <Activity size={20} className="dashboard-health-icon"/>
          </div>
          <div className="dashboard-health-list">
            <div><span className="status-dot sent"/><span><strong>Captura de grupos</strong><small>{monitoredGroups} grupo(s) monitorado(s)</small></span></div>
            <div><span className="status-dot sent"/><span><strong>Instâncias</strong><small>{connectedInstances} conta(s) conectada(s)</small></span></div>
            <div><span className={failedToday ? "status-dot failed" : "status-dot sent"}/><span><strong>Fila de envio</strong><small>{failedToday ? `${failedToday} erro(s) hoje` : "sem falhas registradas hoje"}</small></span></div>
            <div><span className="status-dot sent"/><span><strong>Processamento em nuvem</strong><small>independente do navegador</small></span></div>
          </div>
        </div>
      </div>

      <div className="dashboard-recent-card">
        <div className="dashboard-live-card-head">
          <div><span className="dashboard-section-kicker">TEMPO REAL</span><h3>Atividade recente</h3></div>
          <Link href="/notificacoes" className="dashboard-link"><Bell size={14}/> Notificações</Link>
        </div>
        <div className="table-wrap dashboard-recent-table">
          <table>
            <thead><tr><th>Evento</th><th>Origem</th><th>Status</th><th>Horário</th></tr></thead>
            <tbody>
              {(eventsResult.data ?? []).map((event: any) => (
                <tr key={event.id}>
                  <td>{eventLabel(event.event_type)}</td>
                  <td className="muted">{event.group_external_id || "UAZAPI"}</td>
                  <td><span className="status-chip"><span className={`status-dot ${event.processing_error ? "failed" : event.processed ? "sent" : "processing"}`}/>{event.processing_error ? "Falhou" : event.processed ? "Processado" : "Processando"}</span></td>
                  <td>{timeLabel(event.received_at)}</td>
                </tr>
              ))}
              {!eventsResult.data?.length ? <tr><td colSpan={4}>Nenhuma atividade recente.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  </>;
}
