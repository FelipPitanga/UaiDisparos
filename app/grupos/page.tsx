import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import SyncButton from "./SyncButton";
import AutoRefresh from "./AutoRefresh";
import MonitorToggle from "./MonitorToggle";
import WebhookStatus from "./WebhookStatus";

export const dynamic = "force-dynamic";

type GroupType = "group" | "community" | "community_group" | "lid_group";
type TypeFilter = "all" | GroupType;

function webhookInfo(payload: any) {
  const root = Array.isArray(payload) ? payload[0] : payload;
  const data = root?.webhook ?? root?.data?.webhook ?? root?.data ?? root ?? {};
  return {
    enabled: Boolean(data?.enabled ?? root?.enabled),
    url: typeof (data?.url ?? root?.url) === "string" ? (data?.url ?? root?.url) : null,
    events: Array.isArray(data?.events ?? root?.events) ? (data?.events ?? root?.events) : [],
  };
}

function groupType(metadata: any): GroupType {
  if (metadata?.is_parent || metadata?.is_community) return "community";
  if (metadata?.linked_parent) return "community_group";
  if (metadata?.addressing_mode === "lid") return "lid_group";
  return "group";
}

function groupKind(metadata: any) {
  const type = groupType(metadata);
  if (type === "community") return "Comunidade";
  if (type === "community_group") return "Grupo da comunidade";
  if (type === "lid_group") return "Grupo • LID";
  return "Grupo";
}

function groupIcon(metadata: any) {
  const type = groupType(metadata);
  if (type === "community") return "◉";
  if (type === "community_group") return "↳";
  if (type === "lid_group") return "◇";
  return "◎";
}

function groupBadgeClass(metadata: any) {
  const type = groupType(metadata);
  if (type === "community") return "ok";
  if (type === "community_group") return "warn";
  if (type === "lid_group") return "";
  return "";
}

function filterHref(instanceId: string, type: TypeFilter) {
  const params = new URLSearchParams();
  if (instanceId) params.set("instance", instanceId);
  if (type !== "all") params.set("type", type);
  return `/grupos?${params.toString()}`;
}

function GroupTable({ groups }: { groups: any[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Tipo</th>
            <th>Nome</th>
            <th>ID</th>
            <th>Participantes</th>
            <th>Monitoramento</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group: any) => (
            <tr key={group.id}>
              <td>
                <span className={`badge ${groupBadgeClass(group.metadata)}`} style={{ whiteSpace: "nowrap" }}>
                  <span aria-hidden="true">{groupIcon(group.metadata)}</span> {groupKind(group.metadata)}
                </span>
              </td>
              <td>
                <div style={{ fontWeight: 700 }}>{group.name || "Sem nome"}</div>
                {group.metadata?.linked_parent ? (
                  <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>
                    Ligado à comunidade {group.metadata.linked_parent}
                  </div>
                ) : null}
              </td>
              <td>{group.external_id}</td>
              <td>{group.member_count ?? "—"}</td>
              <td><MonitorToggle id={group.id} initialEnabled={Boolean(group.monitoring_enabled)} /></td>
            </tr>
          ))}
          {!groups.length ? <tr><td colSpan={5}>Nenhum item nesta categoria.</td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}

export default async function Page({ searchParams }: { searchParams?: { instance?: string; type?: string } }) {
  const supabase = getSupabaseAdmin();

  const { data: monitors } = await supabase
    .from("instances")
    .select("id,name,status,instance_role,phone,webhook_enabled,base_url,api_token")
    .eq("instance_role", "monitor")
    .order("created_at", { ascending: true });

  const selectedId = searchParams?.instance || monitors?.[0]?.id || "";
  const selectedMonitor = (monitors ?? []).find((item) => item.id === selectedId) ?? null;
  const requestedType = String(searchParams?.type || "all");
  const selectedType: TypeFilter = ["group", "community", "community_group", "lid_group"].includes(requestedType)
    ? requestedType as TypeFilter
    : "all";

  const groupsQuery = supabase
    .from("groups")
    .select("id,name,external_id,member_count,monitoring_enabled,updated_at,instance_id,metadata")
    .order("name", { ascending: true });

  const { data: groups, error } = selectedId
    ? await groupsQuery.eq("instance_id", selectedId)
    : { data: [], error: null };

  const allGroups = (groups ?? []) as any[];
  const normalGroups = allGroups.filter((g) => groupType(g.metadata) === "group");
  const communities = allGroups.filter((g) => groupType(g.metadata) === "community");
  const communityGroups = allGroups.filter((g) => groupType(g.metadata) === "community_group");
  const lidGroups = allGroups.filter((g) => groupType(g.metadata) === "lid_group");
  const monitoredCount = allGroups.filter((g) => g.monitoring_enabled).length;
  const communityCount = communities.length + communityGroups.length;

  const filteredGroups = selectedType === "all"
    ? allGroups
    : allGroups.filter((g) => groupType(g.metadata) === selectedType);

  let providerWebhook = { enabled: false, url: null as string | null, events: [] as string[] };
  let providerWebhookError: string | null = null;

  if (selectedMonitor?.base_url && selectedMonitor?.api_token) {
    try {
      const response = await fetch(`${String(selectedMonitor.base_url).replace(/\/$/, "")}/webhook`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          token: selectedMonitor.api_token,
        },
        cache: "no-store",
      });
      const text = await response.text();
      let payload: any = null;
      try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
      if (!response.ok) throw new Error(`UAZAPI ${response.status}`);
      providerWebhook = webhookInfo(payload);
    } catch (err) {
      providerWebhookError = err instanceof Error ? err.message : "Falha ao consultar webhook";
    }
  }

  const expectedUrl = process.env.UAZAPI_WEBHOOK_URL?.trim() || null;
  let endpointReachable = false;
  let endpointError: string | null = null;

  if (expectedUrl) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(expectedUrl, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const body = await response.json().catch(() => null);
      endpointReachable = response.ok && body?.ok === true && body?.service === "uaidisparos-uazapi-webhook";
      if (!endpointReachable) endpointError = `resposta inesperada (${response.status})`;
    } catch (err) {
      endpointError = err instanceof Error ? err.message : "não foi possível acessar o endpoint";
    }
  } else {
    endpointError = "UAZAPI_WEBHOOK_URL não configurada";
  }

  const { data: lastEvent } = selectedId
    ? await supabase
        .from("webhook_events")
        .select("id,event_type,group_external_id,participant_external_id,phone,lid,processed,processing_error,received_at")
        .eq("instance_id", selectedId)
        .order("received_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Grupos & comunidades</h1>
          <div className="subtitle">Grupos normais e estruturas de comunidade agora ficam identificados separadamente. Leads por telefone ou @lid continuam usando o mesmo monitoramento.</div>
        </div>
        <div className="toolbar">
          <AutoRefresh intervalMs={1000} />
          {selectedId ? <SyncButton instanceId={selectedId} /> : null}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="section-title">Instância monitoradora</div>
        {(monitors ?? []).length ? (
          <div className="toolbar">
            {(monitors ?? []).map((monitor) => (
              <Link
                key={monitor.id}
                href={filterHref(monitor.id, selectedType)}
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
              <span className="badge">{allGroups.length} total</span>
              {communityCount ? <span className="badge ok">{communityCount} de comunidade</span> : null}
              <span className="badge ok">{monitoredCount} monitorando</span>
            </div>
          </div>
        ) : null}
      </div>

      {selectedMonitor ? (
        <WebhookStatus
          monitorName={selectedMonitor.name}
          dbEnabled={Boolean(selectedMonitor.webhook_enabled)}
          providerEnabled={providerWebhook.enabled}
          providerUrl={providerWebhook.url}
          providerEvents={providerWebhook.events}
          providerError={providerWebhookError}
          expectedUrl={expectedUrl}
          endpointReachable={endpointReachable}
          endpointError={endpointError}
          lastEvent={lastEvent ?? null}
        />
      ) : null}

      {error ? (
        <div className="card">
          <div className="label">Erro ao carregar grupos</div>
          <div className="subtitle">{error.message}</div>
        </div>
      ) : null}

      <div className="instance-summary-grid" style={{ marginBottom: 18 }}>
        <div className="card"><div className="label">Grupos normais</div><div className="metric">{normalGroups.length}</div></div>
        <div className="card"><div className="label">Comunidades</div><div className="metric">{communities.length}</div></div>
        <div className="card"><div className="label">Grupos da comunidade</div><div className="metric">{communityGroups.length}</div></div>
        <div className="card"><div className="label">Grupos LID</div><div className="metric">{lidGroups.length}</div></div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="section-title">Filtrar por tipo</div>
        <div className="toolbar" style={{ marginTop: 10 }}>
          {([
            ["all", `Todos (${allGroups.length})`],
            ["group", `Grupos (${normalGroups.length})`],
            ["community", `Comunidades (${communities.length})`],
            ["community_group", `Grupos da comunidade (${communityGroups.length})`],
            ["lid_group", `LID (${lidGroups.length})`],
          ] as Array<[TypeFilter, string]>).map(([type, label]) => (
            <Link
              key={type}
              href={filterHref(selectedId, type)}
              className={`btn ${selectedType === type ? "" : "secondary"}`}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      {selectedType === "all" ? (
        <div style={{ display: "grid", gap: 24 }}>
          {communities.length ? <section><div className="section-title" style={{ marginBottom: 10 }}>◉ Comunidades</div><GroupTable groups={communities} /></section> : null}
          {communityGroups.length ? <section><div className="section-title" style={{ marginBottom: 10 }}>↳ Grupos das comunidades</div><GroupTable groups={communityGroups} /></section> : null}
          {lidGroups.length ? <section><div className="section-title" style={{ marginBottom: 10 }}>◇ Grupos com identidade LID</div><GroupTable groups={lidGroups} /></section> : null}
          {normalGroups.length ? <section><div className="section-title" style={{ marginBottom: 10 }}>◎ Grupos normais</div><GroupTable groups={normalGroups} /></section> : null}
          {!allGroups.length ? <GroupTable groups={[]} /> : null}
        </div>
      ) : (
        <GroupTable groups={filteredGroups} />
      )}
    </>
  );
}
