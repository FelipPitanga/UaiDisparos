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
  const dayKeys = new Set(days.map((d) => d.key));
  const queryCutoff = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();

  const [groupSentRows, privateSentRows, groupFailedRows, privateFailedRows, activeGroupOps, activePrivateOps] = await Promise.all([
    supabase.from("jobs").select("processed_at").eq("status", "sent").gte("processed_at", queryCutoff),
    supabase.from("private_broadcast_recipients").select("processed_at").eq("status", "sent").gte("processed_at", queryCutoff),
    supabase.from("jobs").select("updated_at").eq("status", "failed").gte("updated_at", queryCutoff),
    supabase.from("private_broadcast_recipients").select("updated_at").eq("status", "failed").gte("updated_at", queryCutoff),
    count("group_automations", q => q.eq("active", true)),
    count("private_broadcasts", q => q.eq("status", "active")),
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

  return <>
    <LiveRefresh intervalMs={1000} />

    <section className="uai-overview-panel">
      <div className="uai-overview-topbar">
        <div>
          <h1>Visão geral</h1>
        </div>
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
  </>;
}
