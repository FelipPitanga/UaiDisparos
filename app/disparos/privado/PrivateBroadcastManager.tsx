"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Campaign = { id: string; name: string; text_content: string | null };
type Sender = { id: string; name: string; status: string; phone: string | null };
type Group = { id: string; name: string | null; external_id: string };
type Lead = { id: string; phone: string | null; name: string | null; group_id: string | null; consent_status: string };
type Broadcast = { id: string; name: string; status: string; campaign_ids: string[]; sender_instance_ids: string[]; source_group_ids: string[]; start_delay_seconds: number; send_interval_seconds: number; daily_limit_per_sender: number };
type Recipient = { id: string; phone: string; status: string; error_message: string | null; processed_at: string | null; scheduled_at: string | null; broadcast_name?: string; campaign_name?: string; sender_name?: string };

type Props = { campaigns: Campaign[]; senders: Sender[]; groups: Group[]; authorizedLeads: Lead[]; broadcasts: Broadcast[]; recipients: Recipient[] };

function toggle(current: string[], id: string, max?: number) {
  if (current.includes(id)) return current.filter((x) => x !== id);
  if (max && current.length >= max) return current;
  return [...current, id];
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return /^55\d{2}9\d{8}$/.test(digits) ? digits : null;
}

function statusClass(status: string) {
  if (status === "sent") return "ok";
  if (status === "failed" || status === "skipped") return "bad";
  if (status === "queued" || status === "paused") return "warn";
  return "";
}

function statusLabel(status: string) {
  if (status === "sent") return "Enviado";
  if (status === "failed") return "Erro";
  if (status === "processing") return "Processando";
  if (status === "paused") return "Pausado";
  if (status === "skipped") return "Ignorado";
  return "Aguardando";
}

export default function PrivateBroadcastManager({ campaigns, senders, groups, authorizedLeads, broadcasts: initialBroadcasts, recipients }: Props) {
  const router = useRouter();
  const [broadcasts, setBroadcasts] = useState(initialBroadcasts);
  const [name, setName] = useState("");
  const [campaignIds, setCampaignIds] = useState<string[]>(campaigns[0]?.id ? [campaigns[0].id] : []);
  const [senderIds, setSenderIds] = useState<string[]>(senders[0]?.id ? [senders[0].id] : []);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [importedNumbers, setImportedNumbers] = useState<string[]>([]);
  const [invalidCount, setInvalidCount] = useState(0);
  const [startDelayMinutes, setStartDelayMinutes] = useState(0);
  const [intervalSeconds, setIntervalSeconds] = useState(30);
  const [dailyLimit, setDailyLimit] = useState(40);
  const [authorized, setAuthorized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  const authorizedPhonesFromGroups = useMemo(() => {
    const set = new Set<string>();
    for (const lead of authorizedLeads) {
      if (!lead.group_id || !groupIds.includes(lead.group_id) || !lead.phone) continue;
      const phone = normalizePhone(lead.phone);
      if (phone) set.add(phone);
    }
    return set;
  }, [authorizedLeads, groupIds]);

  const totalRecipients = useMemo(() => {
    const all = new Set(importedNumbers);
    authorizedPhonesFromGroups.forEach((phone) => all.add(phone));
    return all.size;
  }, [importedNumbers, authorizedPhonesFromGroups]);

  const suggestedSenders = Math.max(1, Math.ceil(totalRecipients / Math.max(1, dailyLimit)));
  const selectedOnline = senderIds.filter((id) => senders.find((s) => s.id === id)?.status === "connected").length;

  async function onTxt(file?: File | null) {
    if (!file) return;
    const text = await file.text();
    const tokens = text.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
    const valid = new Set<string>();
    let invalid = 0;
    for (const token of tokens) {
      const phone = normalizePhone(token);
      if (phone) valid.add(phone);
      else invalid += 1;
    }
    setImportedNumbers([...valid]);
    setInvalidCount(invalid);
  }

  async function createBroadcast() {
    setBusy(true);
    setMessage("");
    try {
      if (!name.trim()) throw new Error("Dê um nome para o disparo.");
      if (!campaignIds.length) throw new Error("Selecione ao menos uma campanha.");
      if (!senderIds.length) throw new Error("Selecione ao menos uma conta.");
      if (!totalRecipients) throw new Error("Adicione um TXT válido ou escolha grupos com leads opt-in.");
      const response = await fetch("/api/private-broadcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          campaign_ids: campaignIds,
          sender_instance_ids: senderIds,
          source_group_ids: groupIds,
          imported_numbers: importedNumbers,
          start_delay_seconds: Math.round(startDelayMinutes * 60),
          send_interval_seconds: Math.round(intervalSeconds),
          daily_limit_per_sender: Math.round(dailyLimit),
          authorization_confirmed: authorized,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(data?.error || "Falha ao criar disparo privado.");
      setBroadcasts((current) => [data.broadcast, ...current]);
      setMessage(`Disparo criado com ${data.recipients} destinatário(s). A fila roda na nuvem.`);
      setName("");
      setImportedNumbers([]);
      setInvalidCount(0);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao criar disparo.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleBroadcast(item: Broadcast) {
    setActionBusyId(item.id);
    try {
      const next = item.status === "active" ? "paused" : "active";
      const response = await fetch(`/api/private-broadcasts/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(data?.error || "Falha ao atualizar.");
      setBroadcasts((current) => current.map((x) => x.id === item.id ? data.broadcast : x));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao atualizar disparo.");
    } finally {
      setActionBusyId(null);
    }
  }

  async function deleteBroadcast(item: Broadcast) {
    if (!window.confirm(`Excluir o disparo \"${item.name}\"?`)) return;
    setActionBusyId(item.id);
    try {
      const response = await fetch(`/api/private-broadcasts/${item.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(data?.error || "Falha ao excluir.");
      setBroadcasts((current) => current.filter((x) => x.id !== item.id));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao excluir disparo.");
    } finally {
      setActionBusyId(null);
    }
  }

  return (
    <>
      <div className="topbar">
        <div><h1>Disparo privado</h1><div className="subtitle">Listas autorizadas + campanhas em rotação + contas disparadoras + fila em nuvem.</div></div>
      </div>

      <div className="card automation-card">
        <div className="section-title">Novo disparo privado</div>
        <div className="muted" style={{ marginBottom: 14 }}>Importe somente contatos que autorizaram receber mensagens. Leads de grupos só entram aqui quando estiverem marcados como opt-in.</div>

        <div className="field modal-field-gap"><label>Nome do disparo</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Lista VIP Setembro" /></div>

        <div className="section-title modal-field-gap">1. Origem dos contatos</div>
        <div className="form-grid">
          <div className="field">
            <label>Importar TXT</label>
            <input className="input" type="file" accept=".txt,text/plain" onChange={(e) => onTxt(e.target.files?.[0])} />
            <div className="muted" style={{ marginTop: 6 }}>Formato aceito: 55 + DDD + 9 + 8 dígitos. Válidos: {importedNumbers.length}{invalidCount ? ` • inválidos ignorados: ${invalidCount}` : ""}</div>
          </div>
          <div className="field">
            <label>Leads opt-in já capturados dos grupos</label>
            <div className="selector-grid">
              {groups.map((group) => {
                const checked = groupIds.includes(group.id);
                const count = authorizedLeads.filter((lead) => lead.group_id === group.id && lead.phone).length;
                return <label className={`selector-card ${checked ? "selected" : ""}`} key={group.id}>
                  <input type="checkbox" checked={checked} onChange={() => setGroupIds((current) => toggle(current, group.id))} />
                  <span><strong>{group.name || group.external_id}</strong><small>{count} lead(s) opt-in disponível(is)</small></span>
                </label>;
              })}
            </div>
          </div>
        </div>

        <div className="section-title modal-field-gap">2. Campanhas em rotação <span className="muted" style={{ fontSize: 12 }}>({campaignIds.length}/5)</span></div>
        <div className="selector-grid">
          {campaigns.map((campaign) => {
            const checked = campaignIds.includes(campaign.id);
            return <label className={`selector-card ${checked ? "selected" : ""}`} key={campaign.id}>
              <input type="checkbox" checked={checked} onChange={() => setCampaignIds((current) => toggle(current, campaign.id, 5))} />
              <span><strong>{campaign.name}</strong><small>{checked ? `Posição ${campaignIds.indexOf(campaign.id) + 1}` : "Adicionar"}</small></span>
            </label>;
          })}
        </div>

        <div className="section-title modal-field-gap">3. Contas disparadoras</div>
        <div className="selector-grid">
          {senders.map((sender) => {
            const checked = senderIds.includes(sender.id);
            return <label className={`selector-card ${checked ? "selected" : ""}`} key={sender.id}>
              <input type="checkbox" checked={checked} onChange={() => setSenderIds((current) => toggle(current, sender.id))} />
              <span><strong>{sender.name}</strong><small>{sender.status === "connected" ? "online" : "offline"}{sender.phone ? ` • +${sender.phone}` : ""}</small></span>
            </label>;
          })}
        </div>

        <div className="form-grid modal-field-gap">
          <div className="field"><label>Esperar antes do primeiro envio (min)</label><input className="input" type="number" min={0} value={startDelayMinutes} onChange={(e) => setStartDelayMinutes(Math.max(0, Number(e.target.value || 0)))} /></div>
          <div className="field"><label>Intervalo entre envios (seg)</label><input className="input" type="number" min={1} value={intervalSeconds} onChange={(e) => setIntervalSeconds(Math.max(1, Number(e.target.value || 1)))} /></div>
          <div className="field"><label>Limite diário interno por conta</label><input className="input" type="number" min={1} value={dailyLimit} onChange={(e) => setDailyLimit(Math.max(1, Number(e.target.value || 1)))} /></div>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <div className="row">
            <div><div className="label">Planejamento</div><div style={{ fontSize: 28, fontWeight: 900 }}>{totalRecipients} contatos</div><div className="muted">Com limite interno de {dailyLimit}/dia por conta, a sugestão operacional é {suggestedSenders} conta(s). Você selecionou {senderIds.length} ({selectedOnline} online).</div></div>
            <span className={`badge ${senderIds.length >= suggestedSenders ? "ok" : "warn"}`}>{senderIds.length >= suggestedSenders ? "Capacidade suficiente" : `Considere +${suggestedSenders - senderIds.length} conta(s)`}</span>
          </div>
        </div>

        <label className="check-row modal-field-gap"><input type="checkbox" checked={authorized} onChange={(e) => setAuthorized(e.target.checked)} /><span><strong>Contatos autorizados</strong><small>Confirmo que os números importados e selecionados deram consentimento para receber mensagens privadas desta empresa.</small></span></label>
        <div className="muted" style={{ marginTop: 10 }}>O sistema usa intervalo real de fila. Não simula “digitando” para se passar por uma pessoa ou para tentar contornar mecanismos anti-spam.</div>
        {message ? <div className="subtitle" style={{ marginTop: 14 }}>{message}</div> : null}
        <button className="btn modal-field-gap" onClick={createBroadcast} disabled={busy || !totalRecipients || !campaignIds.length || !senderIds.length}>{busy ? "Criando..." : "Criar e iniciar disparo"}</button>
      </div>

      <div className="section" style={{ marginTop: 26 }}>
        <div className="section-title">Disparos privados</div>
        <div className="automation-list">
          {broadcasts.map((item) => <div className="card automation-row" key={item.id}>
            <div className="automation-main"><div><div className="instance-name">{item.name}</div><div className="muted">{item.campaign_ids?.length || 0} campanha(s) • {item.sender_instance_ids?.length || 0} conta(s) • intervalo {item.send_interval_seconds}s • limite {item.daily_limit_per_sender}/dia</div></div><span className={`badge ${item.status === "active" ? "ok" : "warn"}`}>{item.status === "active" ? "Ativo" : "Pausado"}</span></div>
            <div className="automation-actions"><button className="btn secondary" onClick={() => toggleBroadcast(item)} disabled={actionBusyId === item.id}>{item.status === "active" ? "Pausar" : "Retomar"}</button><button className="btn danger-btn" onClick={() => deleteBroadcast(item)} disabled={actionBusyId === item.id}>Excluir</button></div>
          </div>)}
          {!broadcasts.length ? <div className="card empty-state">Nenhum disparo privado criado.</div> : null}
        </div>
      </div>

      <div className="section" style={{ marginTop: 26 }}>
        <div className="section-title">Fila e histórico ao vivo</div>
        <div className="muted">Atualiza a cada 2 segundos enquanto a página está aberta. O processamento continua na nuvem com a página fechada.</div>
        <div className="table-wrap" style={{ marginTop: 12 }}><table><thead><tr><th>Número</th><th>Disparo</th><th>Campanha</th><th>Conta</th><th>Status</th><th>Detalhe</th></tr></thead><tbody>
          {recipients.map((row) => <tr key={row.id}><td>+{row.phone}</td><td>{row.broadcast_name || "—"}</td><td>{row.campaign_name || "—"}</td><td>{row.sender_name || "—"}</td><td><span className={`badge ${statusClass(row.status)}`}>{statusLabel(row.status)}</span></td><td className="muted">{row.error_message || (row.processed_at ? "Concluído" : row.scheduled_at ? `Agendado ${new Date(row.scheduled_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "Na fila")}</td></tr>)}
          {!recipients.length ? <tr><td colSpan={6}>Nenhum envio privado ainda.</td></tr> : null}
        </tbody></table></div>
      </div>
    </>
  );
}
