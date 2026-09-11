import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import SyncButton from "./SyncButton";
import AutoRefresh from "./AutoRefresh";
import MonitorToggle from "./MonitorToggle";
import WebhookStatus from "./WebhookStatus";

export const dynamic = "force-dynamic";

function webhookInfo(payload: any) {
  const root = Array.isArray(payload) ? payload[0] : payload;
  const data = root?.webhook ?? root?.data?.webhook ?? root?.data ?? root ?? {};
  return {
    enabled: Boolean(data?.enabled ?? root?.enabled),
    url: typeof (data?.url ?? root?.url) === "string" ? (data?.url ?? root?.url) : null,
    events: Array.isArray(data?.events ?? root?.events) ? (data?.events ?? root?.events) : [],
  };
}

export default async function Page({ searchParams }: { searchParams?: { instance?: string } }) {
  const supabase = getSupabaseAdmin();

  const { data: monitors } = await supabase
    .from("instances")
    .select("id,name,status,instance_role,phone,webhook_enabled,base_url,api_token")
    .eq("instance_role", "monitor")
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
          <h1>Grupos</h1>
          <div className="subtitle">Webhook captura entradas em tempo real. A lista de grupos é sincronizada automaticamente a cada 10 segundos.</div>
        </div>
        <div className="toolbar">
          <AutoRefresh intervalMs={10000} />
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
