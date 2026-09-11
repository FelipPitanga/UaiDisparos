import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import SyncButton from "./SyncButton";
import MonitorToggle from "./MonitorToggle";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams?: { instance?: string } }) {
  const supabase = getSupabaseAdmin();

  const { data: monitors } = await supabase
    .from("instances")
    .select("id,name,status,instance_role,phone,webhook_enabled")
    .in("instance_role", ["monitor", "both"])
    .order("created_at", { ascending: true });

  const selectedId = searchParams?.instance || monitors?.[0]?.id || "";
  const selectedMonitor = (monitors ?? []).find((item) => item.id === selectedId) ?? null;

  const groupsQuery = supabase
    .from("groups")
    .select("id,name,external_id,member_count,monitoring_enabled,updated_at,instance_id")
    .order("name", { ascending: true });

  const { data: groups, error } = selectedId
    ? await groupsQuery.eq("instance_id", selectedId)
    : { data: [], error: null };

  const monitoredCount = (groups ?? []).filter((g) => g.monitoring_enabled).length;

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Grupos</h1>
          <div className="subtitle">Escolha o monitorador, sincronize os grupos e marque quais entram no monitoramento.</div>
        </div>
        {selectedId ? <SyncButton instanceId={selectedId} /> : null}
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="section-title">Instância monitoradora</div>
        {(monitors ?? []).length ? (
          <div className="toolbar">
            {(monitors ?? []).map((monitor) => (
              <Link
                key={monitor.id}
                href={`/grupos?instance=${monitor.id}`}
                className={`btn ${monitor.id === selectedId ? "" : "secondary"}`}
              >
                {monitor.name} {monitor.status === "connected" ? "• online" : "• offline"}
              </Link>
            ))}
          </div>
        ) : (
          <div className="muted">Nenhuma instância monitoradora criada. Vá em Instâncias e crie o Monitor X/Y primeiro.</div>
        )}

        {selectedMonitor ? (
          <div className="row" style={{ marginTop: 16, alignItems: "flex-end" }}>
            <div>
              <div className="label">Selecionada</div>
              <div style={{ fontWeight: 800, marginTop: 4 }}>{selectedMonitor.name}</div>
              <div className="muted" style={{ marginTop: 4 }}>
                {selectedMonitor.phone ? `+${selectedMonitor.phone}` : "sem número"} • {selectedMonitor.status}
              </div>
            </div>
            <div className="toolbar">
              <span className={`badge ${selectedMonitor.webhook_enabled ? "ok" : "warn"}`}>
                Webhook {selectedMonitor.webhook_enabled ? "ativo" : "pendente"}
              </span>
              <span className="badge">{(groups ?? []).length} grupos</span>
              <span className="badge ok">{monitoredCount} monitorando</span>
            </div>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="card">
          <div className="label">Erro ao carregar grupos</div>
          <div className="subtitle">{error.message}</div>
        </div>
      ) : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Grupo</th>
              <th>ID</th>
              <th>Participantes</th>
              <th>Monitoramento</th>
            </tr>
          </thead>
          <tbody>
            {(groups ?? []).map((group) => (
              <tr key={group.id}>
                <td>{group.name || "Sem nome"}</td>
                <td>{group.external_id}</td>
                <td>{group.member_count ?? "—"}</td>
                <td><MonitorToggle id={group.id} initialEnabled={Boolean(group.monitoring_enabled)} /></td>
              </tr>
            ))}
            {!groups?.length ? (
              <tr><td colSpan={4}>{selectedId ? "Nenhum grupo sincronizado para essa instância." : "Escolha uma instância monitoradora."}</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
