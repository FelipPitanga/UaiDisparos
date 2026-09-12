"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type LastEvent = {
  id: number;
  event_type: string | null;
  group_external_id: string | null;
  participant_external_id: string | null;
  phone: string | null;
  lid: string | null;
  processed: boolean;
  processing_error: string | null;
  received_at: string;
} | null;

type Props = {
  monitorName: string;
  dbEnabled: boolean;
  providerEnabled: boolean;
  providerUrl: string | null;
  providerEvents: string[];
  providerError: string | null;
  expectedUrl: string | null;
  endpointReachable: boolean;
  endpointError: string | null;
  lastEvent: LastEvent;
};

function dateLabel(value: string | null | undefined) {
  if (!value) return "nenhum evento recebido";
  try {
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function WebhookStatus(props: Props) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const urlMatches = Boolean(props.providerUrl && props.expectedUrl && props.providerUrl === props.expectedUrl);
  const groupsEventEnabled = props.providerEvents.includes("groups");
  const healthy = props.dbEnabled && props.providerEnabled && urlMatches && groupsEventEnabled && props.endpointReachable && !props.providerError;

  async function refresh() {
    setRefreshing(true);
    router.refresh();
    window.setTimeout(() => setRefreshing(false), 700);
  }

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div>
          <div className="section-title" style={{ marginBottom: 4 }}>Diagnóstico do webhook</div>
          <div className="muted">{props.monitorName} • acompanha a atualização da tela de grupos</div>
        </div>
        <div className="toolbar">
          <span className={`badge ${healthy ? "ok" : "warn"}`}>{healthy ? "Tudo certo" : "Revisar webhook"}</span>
          <button className="btn secondary" onClick={refresh} disabled={refreshing}>{refreshing ? "Atualizando..." : "Atualizar agora"}</button>
        </div>
      </div>

      <div className="grid" style={{ marginTop: 16 }}>
        <div className="card"><div className="label">Status na UAZAPI</div><div style={{ marginTop: 8, fontWeight: 800 }}>{props.providerError ? "Erro ao consultar" : props.providerEnabled ? "Ativo" : "Inativo"}</div><div className="muted" style={{ marginTop: 6 }}>{props.providerError ?? (groupsEventEnabled ? "evento groups habilitado" : "evento groups não encontrado")}</div></div>
        <div className="card"><div className="label">Endpoint público</div><div style={{ marginTop: 8, fontWeight: 800 }}>{props.endpointReachable ? "Acessível" : "Indisponível"}</div><div className="muted" style={{ marginTop: 6 }}>{props.endpointError ?? "endpoint respondeu corretamente"}</div></div>
        <div className="card"><div className="label">URL configurada</div><div style={{ marginTop: 8, fontWeight: 800, wordBreak: "break-all" }}>{props.providerUrl ?? "não retornada pela UAZAPI"}</div><div className="muted" style={{ marginTop: 6 }}>{props.expectedUrl ? (urlMatches ? "bate com a URL atual do sistema" : `esperada: ${props.expectedUrl}`) : "UAZAPI_WEBHOOK_URL não configurada"}</div></div>
        <div className="card"><div className="label">Último evento recebido</div><div style={{ marginTop: 8, fontWeight: 800 }}>{props.lastEvent ? props.lastEvent.event_type || "evento sem tipo" : "nenhum"}</div><div className="muted" style={{ marginTop: 6 }}>{dateLabel(props.lastEvent?.received_at)}</div>{props.lastEvent ? <div className="muted" style={{ marginTop: 4 }}>#{props.lastEvent.id} • {props.lastEvent.processed ? "processado" : "pendente"}{props.lastEvent.processing_error ? ` • ${props.lastEvent.processing_error}` : ""}</div> : null}</div>
      </div>
    </div>
  );
}
