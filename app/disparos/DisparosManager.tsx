"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Campaign = { id: string; name: string; text_content: string | null };
type Sender = { id: string; name: string; status: string; phone: string | null };
type Group = { id: string; name: string | null; external_id: string; monitoring_enabled: boolean };
type Automation = { id: string; group_id: string; campaign_id: string; sender_instance_id: string; active: boolean; authorization_confirmed: boolean };
type Job = { id: string; recipient: string | null; status: string; error_message: string | null; created_at: string; processed_at: string | null; campaign_name?: string; group_name?: string; sender_name?: string };

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

export default function DisparosManager({ campaigns, senders, groups, automations: initialAutomations, jobs }: Props) {
  const router = useRouter();
  const [automations, setAutomations] = useState(initialAutomations);
  const [groupId, setGroupId] = useState(groups[0]?.id || "");
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id || "");
  const [senderId, setSenderId] = useState(senders[0]?.id || "");
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
    setCampaignId(item.campaign_id);
    setSenderId(item.sender_instance_id);
    setActive(item.active);
    setAuthorized(item.authorization_confirmed);
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveAutomation() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          group_id: groupId,
          campaign_id: campaignId,
          sender_instance_id: senderId,
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
        ? "Automação ativa. A partir de agora, todo NOVO lead desse grupo entra na fila e é enviado automaticamente pelo chip escolhido."
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
        ? "Automação reativada. Os próximos novos leads serão disparados automaticamente."
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
        <div><h1>Disparos</h1><div className="subtitle">Escolha campanha + chip + grupo. Depois é automático.</div></div>
        <button className="btn secondary" onClick={processQueue} disabled={queueBusy}>{queueBusy ? "Processando..." : "Processar fila agora"}</button>
      </div>

      <div className="card automation-card">
        <div className="section-title">Automação de grupo</div>
        <div className="muted" style={{ marginBottom: 14 }}>
          Ao salvar como ativa, somente os NOVOS números que entrarem nesse grupo a partir daí serão enviados automaticamente, sem precisar apertar outro botão.
        </div>
        <div className="form-grid modal-field-gap">
          <div className="field"><label>Grupo que gera os leads</label><select className="select" value={groupId} onChange={(e) => setGroupId(e.target.value)}>{groups.map((g) => <option key={g.id} value={g.id}>{g.name || g.external_id}</option>)}</select></div>
          <div className="field"><label>Campanha</label><select className="select" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="field"><label>Chip disparador</label><select className="select" value={senderId} onChange={(e) => setSenderId(e.target.value)}>{senders.map((s) => <option key={s.id} value={s.id}>{s.name} {s.status === "connected" ? "• online" : "• offline"}</option>)}</select></div>
        </div>

        <div className="automation-switches">
          <label className="check-row"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /><span><strong>Automação ativa</strong><small>Novas entradas desse grupo geram envio automaticamente.</small></span></label>
          <label className="check-row"><input type="checkbox" checked={authorized} onChange={(e) => setAuthorized(e.target.checked)} /><span><strong>Contato autorizado</strong><small>Confirmo que esta campanha/grupo possui base de autorização para contato privado.</small></span></label>
        </div>

        {!groups.length || !campaigns.length || !senders.length ? <div className="alert-error compact">Para ativar, tenha pelo menos 1 grupo, 1 campanha e 1 disparador.</div> : null}
        {message ? <div className="subtitle" style={{ marginTop: 14 }}>{message}</div> : null}
        <button className="btn modal-field-gap" onClick={saveAutomation} disabled={busy || !groups.length || !campaigns.length || !senders.length}>{busy ? "Salvando..." : "Salvar automação"}</button>
      </div>

      <div className="section" style={{ marginTop: 26 }}>
        <div className="section-title">Automações configuradas</div>
        <div className="automation-list">
          {automations.map((item) => (
            <div className="card automation-row" key={item.id}>
              <button className="automation-main" onClick={() => loadAutomation(item)}>
                <div>
                  <div className="instance-name">{groupMap.get(item.group_id)?.name || "Grupo"}</div>
                  <div className="muted">{campaignMap.get(item.campaign_id)?.name || "Campanha"} → {senderMap.get(item.sender_instance_id)?.name || "Disparador"}</div>
                </div>
                <span className={`badge ${item.active ? "ok" : "warn"}`}>{item.active ? "Ativa" : "Pausada"}</span>
              </button>
              <div className="automation-actions">
                <button className="btn secondary" onClick={() => toggleAutomation(item)} disabled={actionBusyId === item.id}>
                  {actionBusyId === item.id ? "Aguarde..." : item.active ? "Pausar disparo" : "Reativar disparo"}
                </button>
                <button className="btn danger-btn" onClick={() => deleteAutomation(item)} disabled={actionBusyId === item.id}>Excluir disparo</button>
              </div>
            </div>
          ))}
          {!automations.length ? <div className="card empty-state">Nenhuma automação configurada.</div> : null}
        </div>
      </div>

      <div className="section" style={{ marginTop: 26 }}>
        <div className="row"><div><div className="section-title">Fila e histórico</div><div className="muted">Os novos leads aparecem aqui assim que entram no fluxo.</div></div></div>
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead><tr><th>Destinatário</th><th>Grupo</th><th>Campanha</th><th>Disparador</th><th>Status</th><th>Detalhe</th></tr></thead>
            <tbody>
              {jobs.map((job) => <tr key={job.id}><td>{job.recipient ? `+${job.recipient}` : "—"}</td><td>{job.group_name || "—"}</td><td>{job.campaign_name || "—"}</td><td>{job.sender_name || "—"}</td><td><span className={`badge ${statusClass(job.status)}`}>{statusLabel(job.status)}</span></td><td className="muted">{job.error_message || (job.processed_at ? "Concluído" : "Na fila")}</td></tr>)}
              {!jobs.length ? <tr><td colSpan={6}>Nenhum disparo na fila ainda.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
