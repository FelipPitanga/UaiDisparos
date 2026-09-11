"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Campaign = { id: string; name: string; text_content: string | null };
type Sender = { id: string; name: string; status: string; phone: string | null };
type Group = { id: string; name: string | null; external_id: string; monitoring_enabled: boolean };
type Automation = {
  id: string;
  group_id: string;
  campaign_id: string;
  sender_instance_id: string;
  campaign_ids?: string[] | null;
  sender_instance_ids?: string[] | null;
  delay_seconds?: number | null;
  send_interval_seconds?: number | null;
  daily_limit_per_sender?: number | null;
  active: boolean;
  authorization_confirmed: boolean;
};
type Job = { id: string; recipient: string | null; status: string; error_message: string | null; created_at: string; scheduled_at?: string | null; processed_at: string | null; campaign_name?: string; group_name?: string; sender_name?: string };

type Props = {
  campaigns: Campaign[];
  senders: Sender[];
  groups: Group[];
  automations: Automation[];
  jobs: Job[];
};

function statusClass(status: string) {
  if (status === "sent") return "ok";
  if (status === "failed") return "bad";
  if (status === "queued" || status === "paused") return "warn";
  return "";
}

function statusLabel(status: string) {
  if (status === "sent") return "Enviado";
  if (status === "failed") return "Erro";
  if (status === "processing") return "Processando";
  if (status === "paused") return "Pausado";
  return "Aguardando";
}

function toggleInList(current: string[], id: string, max?: number) {
  if (current.includes(id)) return current.filter((item) => item !== id);
  if (max && current.length >= max) return current;
  return [...current, id];
}

export default function DisparosManager({ campaigns, senders, groups, automations: initialAutomations, jobs }: Props) {
  const router = useRouter();
  const [automations, setAutomations] = useState(initialAutomations);
  const [groupId, setGroupId] = useState(groups[0]?.id || "");
  const [campaignIds, setCampaignIds] = useState<string[]>(campaigns[0]?.id ? [campaigns[0].id] : []);
  const [senderIds, setSenderIds] = useState<string[]>(senders[0]?.id ? [senders[0].id] : []);
  const [delayMinutes, setDelayMinutes] = useState(0);
  const [sendIntervalSeconds, setSendIntervalSeconds] = useState(30);
  const [dailyLimit, setDailyLimit] = useState(40);
  const [active, setActive] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [queueBusy, setQueueBusy] = useState(false);
  const [message, setMessage] = useState("");

  const groupMap = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const campaignMap = useMemo(() => new Map(campaigns.map((c) => [c.id, c])), [campaigns]);
  const senderMap = useMemo(() => new Map(senders.map((s) => [s.id, s])), [senders]);

  function loadAutomation(item: Automation) {
    setGroupId(item.group_id);
    setCampaignIds(item.campaign_ids?.length ? item.campaign_ids : item.campaign_id ? [item.campaign_id] : []);
    setSenderIds(item.sender_instance_ids?.length ? item.sender_instance_ids : item.sender_instance_id ? [item.sender_instance_id] : []);
    setDelayMinutes(Math.round(Number(item.delay_seconds || 0) / 60));
    setSendIntervalSeconds(Number(item.send_interval_seconds ?? 30));
    setDailyLimit(Number(item.daily_limit_per_sender || 40));
    setActive(item.active);
    setAuthorized(item.authorization_confirmed);
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveAutomation() {
    setBusy(true);
    setMessage("");
    try {
      if (!campaignIds.length) throw new Error("Selecione pelo menos uma campanha.");
      if (!senderIds.length) throw new Error("Selecione pelo menos um disparador.");

      const response = await fetch("/api/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          group_id: groupId,
          campaign_ids: campaignIds,
          sender_instance_ids: senderIds,
          delay_seconds: Math.max(0, Math.round(delayMinutes * 60)),
          send_interval_seconds: Math.max(0, Math.round(sendIntervalSeconds)),
          daily_limit_per_sender: Math.max(1, Math.round(dailyLimit)),
          active,
          authorization_confirmed: authorized,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(data?.error || "Falha ao salvar automação.");
      setAutomations((current) => {
        const exists = current.some((x) => x.group_id === data.automation.group_id);
        return exists ? current.map((x) => x.group_id === data.automation.group_id ? data.automation : x) : [data.automation, ...current];
      });
      setMessage(active
        ? "Automação ativa. Novos leads entram na fila e os envios respeitam o atraso e o intervalo configurados."
        : "Automação salva pausada.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao salvar automação.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleAutomation(item: Automation) {
    setActionBusyId(item.id);
    setMessage("");
    try {
      const response = await fetch(`/api/automations/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !item.active }),
      });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(data?.error || "Falha ao alterar automação.");
      setAutomations((current) => current.map((x) => x.id === item.id ? data.automation : x));
      setMessage(data.automation.active
        ? "Automação reativada. Os próximos novos leads serão processados conforme as regras salvas."
        : "Automação pausada. Nenhum novo lead desse grupo será disparado enquanto estiver pausada.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao alterar automação.");
    } finally {
      setActionBusyId(null);
    }
  }

  async function deleteAutomation(item: Automation) {
    const groupName = groupMap.get(item.group_id)?.name || "este grupo";
    if (!window.confirm(`Excluir a automação de \"${groupName}\"?\n\nOs disparos futuros desse grupo serão interrompidos.`)) return;

    setActionBusyId(item.id);
    setMessage("");
    try {
      const response = await fetch(`/api/automations/${item.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(data?.error || "Falha ao excluir automação.");
      setAutomations((current) => current.filter((x) => x.id !== item.id));
      setMessage("Automação excluída.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao excluir automação.");
    } finally {
      setActionBusyId(null);
    }
  }

  async function processQueue() {
    setQueueBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/jobs/process", { method: "POST" });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(data?.error || "Falha ao processar fila.");
      setMessage(`${data.processed} job(s) processado(s).`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao processar fila.");
    } finally {
      setQueueBusy(false);
    }
  }

  return (
    <>
      <div className="topbar">
        <div><h1>Disparos</h1><div className="subtitle">Grupo + campanhas + contas + tempo de espera + intervalo entre envios.</div></div>
        <button className="btn secondary" onClick={processQueue} disabled={queueBusy}>{queueBusy ? "Processando..." : "Processar fila agora"}</button>
      </div>

      <div className="card automation-card">
        <div className="section-title">Automação de grupo</div>
        <div className="muted" style={{ marginBottom: 14 }}>
          O sistema roda em nuvem mesmo com o site fechado. O intervalo abaixo serve para escoar picos de fila sem mandar vários contatos pela mesma conta ao mesmo tempo.
        </div>

        <div className="field modal-field-gap">
          <label>Grupo que gera os leads</label>
          <select className="select" value={groupId} onChange={(e) => setGroupId(e.target.value)}>{groups.map((g) => <option key={g.id} value={g.id}>{g.name || g.external_id}</option>)}</select>
        </div>

        <div className="section-title modal-field-gap">Campanhas em rotação <span className="muted" style={{ fontSize: 12, fontWeight: 500 }}>({campaignIds.length}/5)</span></div>
        <div className="selector-grid">
          {campaigns.map((campaign) => {
            const checked = campaignIds.includes(campaign.id);
            return <label className={`selector-card ${checked ? "selected" : ""}`} key={campaign.id}>
              <input type="checkbox" checked={checked} onChange={() => setCampaignIds((current) => toggleInList(current, campaign.id, 5))} />
              <span><strong>{campaign.name}</strong><small>{checked ? `Posição ${campaignIds.indexOf(campaign.id) + 1} na rotação` : "Adicionar à rotação"}</small></span>
            </label>;
          })}
        </div>

        <div className="section-title modal-field-gap">Contas disparadoras</div>
        <div className="selector-grid">
          {senders.map((sender) => {
            const checked = senderIds.includes(sender.id);
            return <label className={`selector-card ${checked ? "selected" : ""}`} key={sender.id}>
              <input type="checkbox" checked={checked} onChange={() => setSenderIds((current) => toggleInList(current, sender.id))} />
              <span><strong>{sender.name}</strong><small>{sender.status === "connected" ? "online" : "offline"}{sender.phone ? ` • +${sender.phone}` : ""}</small></span>
            </label>;
          })}
        </div>

        <div className="form-grid modal-field-gap">
          <div className="field">
            <label>Esperar após a entrada do lead (minutos)</label>
            <input className="input" type="number" min={0} max={1440} value={delayMinutes} onChange={(e) => setDelayMinutes(Math.max(0, Number(e.target.value || 0)))} />
          </div>
          <div className="field">
            <label>Intervalo mínimo entre envios por conta (segundos)</label>
            <input className="input" type="number" min={0} max={3600} value={sendIntervalSeconds} onChange={(e) => setSendIntervalSeconds(Math.max(0, Number(e.target.value || 0)))} />
          </div>
          <div className="field">
            <label>Limite diário por conta</label>
            <input className="input" type="number" min={1} max={1000} value={dailyLimit} onChange={(e) => setDailyLimit(Math.max(1, Number(e.target.value || 1)))} />
          </div>
        </div>

        <div className="automation-switches">
          <label className="check-row"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /><span><strong>Automação ativa</strong><small>Novas entradas desse grupo entram automaticamente na fila.</small></span></label>
          <label className="check-row"><input type="checkbox" checked={authorized} onChange={(e) => setAuthorized(e.target.checked)} /><span><strong>Contato autorizado</strong><small>Confirmo que as pessoas desse fluxo deram consentimento para receber mensagens privadas desta empresa no WhatsApp.</small></span></label>
        </div>

        {!groups.length || !campaigns.length || !senders.length ? <div className="alert-error compact">Para ativar, tenha pelo menos 1 grupo, 1 campanha e 1 disparador.</div> : null}
        {message ? <div className="subtitle" style={{ marginTop: 14 }}>{message}</div> : null}
        <button className="btn modal-field-gap" onClick={saveAutomation} disabled={busy || !groups.length || !campaignIds.length || !senderIds.length}>{busy ? "Salvando..." : "Salvar automação"}</button>
      </div>

      <div className="section" style={{ marginTop: 26 }}>
        <div className="section-title">Automações configuradas</div>
        <div className="automation-list">
          {automations.map((item) => {
            const itemCampaigns = item.campaign_ids?.length ? item.campaign_ids : item.campaign_id ? [item.campaign_id] : [];
            const itemSenders = item.sender_instance_ids?.length ? item.sender_instance_ids : item.sender_instance_id ? [item.sender_instance_id] : [];
            return <div className="card automation-row" key={item.id}>
              <button className="automation-main" onClick={() => loadAutomation(item)}>
                <div>
                  <div className="instance-name">{groupMap.get(item.group_id)?.name || "Grupo"}</div>
                  <div className="muted">{itemCampaigns.map((id) => campaignMap.get(id)?.name).filter(Boolean).join(" → ") || "Campanha"}</div>
                  <div className="muted" style={{ marginTop: 4 }}>{itemSenders.map((id) => senderMap.get(id)?.name).filter(Boolean).join(" • ") || "Disparador"} · espera {Math.round(Number(item.delay_seconds || 0) / 60)} min · intervalo {Number(item.send_interval_seconds ?? 30)}s · limite {item.daily_limit_per_sender || 40}/dia por conta</div>
                </div>
                <span className={`badge ${item.active ? "ok" : "warn"}`}>{item.active ? "Ativa" : "Pausada"}</span>
              </button>
              <div className="automation-actions">
                <button className="btn secondary" onClick={() => toggleAutomation(item)} disabled={actionBusyId === item.id}>{actionBusyId === item.id ? "Aguarde..." : item.active ? "Pausar disparo" : "Reativar disparo"}</button>
                <button className="btn danger-btn" onClick={() => deleteAutomation(item)} disabled={actionBusyId === item.id}>Excluir disparo</button>
              </div>
            </div>;
          })}
          {!automations.length ? <div className="card empty-state">Nenhuma automação configurada.</div> : null}
        </div>
      </div>

      <div className="section" style={{ marginTop: 26 }}>
        <div className="row"><div><div className="section-title">Fila e histórico</div><div className="muted">Atualiza ao vivo. Se vários leads entrarem juntos, eles permanecem na fila e saem respeitando o intervalo configurado.</div></div></div>
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead><tr><th>Destinatário</th><th>Grupo</th><th>Campanha</th><th>Disparador</th><th>Status</th><th>Detalhe</th></tr></thead>
            <tbody>
              {jobs.map((job) => <tr key={job.id}><td>{job.recipient ? `+${job.recipient}` : "—"}</td><td>{job.group_name || "—"}</td><td>{job.campaign_name || "—"}</td><td>{job.sender_name || "—"}</td><td><span className={`badge ${statusClass(job.status)}`}>{statusLabel(job.status)}</span></td><td className="muted">{job.error_message || (job.scheduled_at && new Date(job.scheduled_at).getTime() > Date.now() ? `Agendado para ${new Date(job.scheduled_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : job.processed_at ? "Concluído" : "Na fila")}</td></tr>)}
              {!jobs.length ? <tr><td colSpan={6}>Nenhum disparo na fila ainda.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
