"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Campaign = { id: string; name: string; text_content: string | null };
type Sender = { id: string; name: string; status: string; phone: string | null };
type Group = {
  id: string;
  name: string | null;
  external_id: string;
  monitoring_enabled: boolean;
  metadata?: {
    is_parent?: boolean;
    is_community?: boolean;
    linked_parent?: string | null;
    addressing_mode?: string | null;
  } | null;
};
type Props = { campaigns: Campaign[]; senders: Sender[]; groups: Group[] };

function toggleInList(current: string[], id: string, max?: number) {
  if (current.includes(id)) return current.filter((item) => item !== id);
  if (max && current.length >= max) return current;
  return [...current, id];
}

function groupKind(group: Group) {
  const metadata = group.metadata || {};
  if (metadata.is_parent || metadata.is_community) return "Comunidade";
  if (metadata.linked_parent) return "Grupo da comunidade";
  if (metadata.addressing_mode === "lid") return "Grupo com identidade LID";
  return "Grupo";
}

export default function DisparosManager({ campaigns, senders, groups }: Props) {
  const router = useRouter();
  const [groupId, setGroupId] = useState(groups[0]?.id || "");
  const [campaignIds, setCampaignIds] = useState<string[]>(campaigns[0]?.id ? [campaigns[0].id] : []);
  const [senderIds, setSenderIds] = useState<string[]>(senders[0]?.id ? [senders[0].id] : []);
  const [delayMinutes, setDelayMinutes] = useState(0);
  const [sendIntervalSeconds, setSendIntervalSeconds] = useState(30);
  const [dailyLimit, setDailyLimit] = useState(40);
  const [active, setActive] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [includeCapturedLeads, setIncludeCapturedLeads] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const selectedGroup = groups.find((group) => group.id === groupId) || null;

  async function saveAutomation() {
    setBusy(true);
    setMessage("");
    try {
      if (!groupId) throw new Error("Selecione um grupo ou comunidade.");
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
          include_captured_leads: includeCapturedLeads,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(data?.error || "Falha ao salvar automação.");

      const backfillText = data?.captured_leads
        ? ` ${data.captured_leads.queued} lead(s) já capturado(s) entraram na fila${data.captured_leads.skipped ? ` e ${data.captured_leads.skipped} já estavam processados/na fila` : ""}.`
        : "";

      setMessage(active
        ? `Automação criada/atualizada.${backfillText} Leads por telefone e @lid usam a mesma fila. Controle, fila e histórico ficam na aba Operações.`
        : "Automação salva pausada. Você pode continuar depois pela aba Operações.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao salvar automação.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Disparo em grupo</h1>
          <div className="subtitle">Grupos normais e comunidades usam a mesma automação. Leads com telefone ou @lid são aceitos pelo fluxo.</div>
        </div>
      </div>

      <div className="card automation-card">
        <div className="section-title">Nova automação de grupo / comunidade</div>
        <div className="muted" style={{ marginBottom: 14 }}>
          O monitor captura novas entradas em nuvem mesmo com o site fechado. Em comunidades, o identificador @lid é preservado até o envio.
        </div>

        <div className="field modal-field-gap">
          <label>Grupo ou comunidade que gera os leads</label>
          <select className="select" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name || g.external_id} • {groupKind(g)}</option>)}
          </select>
          {selectedGroup ? (
            <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
              {groupKind(selectedGroup)} • {selectedGroup.external_id} • {selectedGroup.monitoring_enabled ? "monitorando" : "monitoramento será ativado ao salvar"}
            </div>
          ) : null}
        </div>

        <div className="section-title modal-field-gap">Quais leads entram neste disparo?</div>
        <div className="selector-grid">
          <label className={`selector-card ${!includeCapturedLeads ? "selected" : ""}`}>
            <input type="radio" name="leadMode" checked={!includeCapturedLeads} onChange={() => setIncludeCapturedLeads(false)} />
            <span>
              <strong>Somente novos leads a partir de agora</strong>
              <small>Quem já foi capturado antes da ativação fica apenas salvo na aba Leads e não entra nesta operação.</small>
            </span>
          </label>
          <label className={`selector-card ${includeCapturedLeads ? "selected" : ""}`}>
            <input type="radio" name="leadMode" checked={includeCapturedLeads} onChange={() => setIncludeCapturedLeads(true)} />
            <span>
              <strong>Incluir leads já capturados deste grupo</strong>
              <small>Inclui telefone e @lid já armazenados e ainda não processados por esta operação. Depois continua capturando os novos automaticamente.</small>
            </span>
          </label>
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
          <label className="check-row"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /><span><strong>Automação ativa</strong><small>Novas entradas desse grupo/comunidade entram automaticamente na fila.</small></span></label>
          <label className="check-row"><input type="checkbox" checked={authorized} onChange={(e) => setAuthorized(e.target.checked)} /><span><strong>Contato autorizado</strong><small>Confirmo que as pessoas desse fluxo deram consentimento para receber mensagens privadas desta empresa no WhatsApp.</small></span></label>
        </div>

        {!groups.length || !campaigns.length || !senders.length ? <div className="alert-error compact">Para ativar, tenha pelo menos 1 grupo/comunidade, 1 campanha e 1 disparador.</div> : null}
        {message ? <div className="subtitle" style={{ marginTop: 14 }}>{message}</div> : null}
        <button className="btn modal-field-gap" onClick={saveAutomation} disabled={busy || !groups.length || !campaignIds.length || !senderIds.length}>{busy ? "Salvando..." : "Salvar automação"}</button>
      </div>
    </>
  );
}
