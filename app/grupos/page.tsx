import Link from "next/link";
import { getSupabaseSession } from "@/lib/supabase/session";
import { requireTenantId } from "@/lib/tenant";
import SyncButton from "./SyncButton";
import AutoRefresh from "./AutoRefresh";
import MonitorToggle from "./MonitorToggle";
import WebhookStatus from "./WebhookStatus";

export const dynamic = "force-dynamic";

type GroupType = "group" | "community";
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

// Importante: addressing_mode === "lid" NÃO significa comunidade.
// Hoje o WhatsApp/UAZAPI retorna LID em muitos grupos normais também.
// Comunidade é somente quando a própria estrutura vem marcada como parent/community.
function groupType(metadata: any): GroupType {
  if (metadata?.is_parent === true || metadata?.is_community === true) return "community";
  return "group";
}

function groupKind(metadata: any) {
  return groupType(metadata) === "community" ? "Comunidade" : "Grupo";
}

function groupIcon(metadata: any) {
  return groupType(metadata) === "community" ? "◉" : "◎";
}

function groupBadgeClass(metadata: any) {
  return groupType(metadata) === "community" ? "ok" : "";
}

function identityMode(metadata: any) {
  return metadata?.addressing_mode === "lid" ? "LID" : "Telefone/JID";
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
            <th>Identidade</th>
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
              </td>
              <td>
                <span className={`badge ${group.metadata?.addressing_mode === "lid" ? "warn" : ""}`}>
                  {identityMode(group.metadata)}
                </span>
              </td>
              <td>{group.external_id}</td>
              <td>{group.member_count ?? "—"}</td>
              <td><MonitorToggle id={group.id} initialEnabled={Boolean(group.monitoring_enabled)} /></td>
            </tr>
          ))}
          {!groups.length ? <tr><td colSpan={6}>Nenhum item nesta categoria.</td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}

export default async function Page({ searchParams }: { searchParams?: { instance?: string; type?: string } }) {
  const accountId = requireTenantId();
  const supabase = getSupabaseSession();

  const { data: monitors } = await supabase
    .from("instances")
    .select("id,name,status,instance_role,phone,webhook_enabled,base_url,api_token")
    .eq("account_id", accountId)
    .eq("instance_role", "monitor")
    .order("created_at", { ascending: true });

  const selectedId = searchParams?.instance || monitors?.[0]?.id || "";
  const selectedMonitor = (monitors ?? []).find((item) => item.id === selectedId) ?? null;
  const requestedType = String(searchParams?.type || "all");
  const selectedType: TypeFilter = ["group", "community"].includes(requestedType)
    ? requestedType as TypeFilter
    : "all";

  const groupsQuery = supabase
    .from("groups")
    .select("id,name,external_id,member_count,monitoring_enabled,updated_at,instance_id,metadata")
    .eq("account_id", accountId)
    .order("name", { ascending: true });

  const { data: groups, error } = selectedId
    ? await groupsQuery.eq("instance_id", selectedId)
    : { data: [], error: null };

  const allGroups = (groups ?? []) as any[];
  const normalGroups = allGroups.filter((g) => groupType(g.metadata) === "group");
  const communities = allGroups.filter((g) => groupType(g.metadata) === "community");
  const lidIdentityCount = allGroups.filter((g) => g.metadata?.addressing_mode === "lid").length;
  const monitoredCount = allGroups.filter((g) => g.monitoring_enabled).length;

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
        .eq("account_id", accountId)
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
          <div className="subtitle">Agora o tipo da estrutura é separado da identidade. Um grupo pode usar LID sem ser uma comunidade.</div>
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
              <span className="badge">{lidIdentityCount} usando LID</span>
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
        <div className="card"><div className="label">Grupos</div><div className="metric">{normalGroups.length}</div></div>
        <div className="card"><div className="label">Comunidades</div><div className="metric">{communities.length}</div></div>
        <div className="card"><div className="label">Estruturas usando LID</div><div className="metric">{lidIdentityCount}</div></div>
        <div className="card"><div className="label">Monitorando</div><div className="metric">{monitoredCount}</div></div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="section-title">Filtrar por tipo</div>
        <div className="muted" style={{ marginTop: 4 }}>LID agora é apenas um modo de identidade, não um tipo de grupo.</div>
        <div className="toolbar" style={{ marginTop: 10 }}>
          {([
            ["all", `Todos (${allGroups.length})`],
            ["group", `Grupos (${normalGroups.length})`],
            ["community", `Comunidades (${communities.length})`],
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
          {normalGroups.length ? <section><div className="section-title" style={{ marginBottom: 10 }}>◎ Grupos</div><GroupTable groups={normalGroups} /></section> : null}
          {!allGroups.length ? <GroupTable groups={[]} /> : null}
        </div>
      ) : (
        <GroupTable groups={filteredGroups} />
      )}
    </>
  );
}
