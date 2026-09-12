"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Campaign = { id: string; name: string; text_content: string | null };
type Sender = { id: string; name: string; status: string; phone: string | null };
type Group = { id: string; ids?: string[]; name: string | null; external_id: string };
type Lead = { id: string; phone: string | null; name: string | null; group_id: string | null; consent_status: string };
type Props = { campaigns: Campaign[]; senders: Sender[]; groups: Group[]; authorizedLeads: Lead[] };

function toggle(current: string[], id: string, max?: number) {
  if (current.includes(id)) return current.filter((x) => x !== id);
  if (max && current.length >= max) return current;
  return [...current, id];
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return /^55\d{2}9\d{8}$/.test(digits) ? digits : null;
}

function parsePhoneText(text: string) {
  const tokens = text.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
  const valid = new Set<string>();
  let invalid = 0;
  for (const token of tokens) {
    const phone = normalizePhone(token);
    if (phone) valid.add(phone);
    else invalid += 1;
  }
  return { valid: [...valid], invalid };
}

export default function PrivateBroadcastManager({ campaigns, senders, groups, authorizedLeads }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [campaignIds, setCampaignIds] = useState<string[]>(campaigns[0]?.id ? [campaigns[0].id] : []);
  const [senderIds, setSenderIds] = useState<string[]>(senders[0]?.id ? [senders[0].id] : []);
  const [selectedGroupKeys, setSelectedGroupKeys] = useState<string[]>([]);
  const [importedNumbers, setImportedNumbers] = useState<string[]>([]);
  const [invalidCount, setInvalidCount] = useState(0);
  const [pastedText, setPastedText] = useState("");
  const [groupSearch, setGroupSearch] = useState("");
  const [startDelayMinutes, setStartDelayMinutes] = useState(0);
  const [intervalSeconds, setIntervalSeconds] = useState(30);
  const [dailyLimit, setDailyLimit] = useState(40);
  const [authorized, setAuthorized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const selectedSourceGroupIds = useMemo(() => {
    const ids = new Set<string>();
    for (const group of groups) {
      if (!selectedGroupKeys.includes(group.external_id)) continue;
      (group.ids?.length ? group.ids : [group.id]).forEach((id) => ids.add(id));
    }
    return [...ids];
  }, [groups, selectedGroupKeys]);

  const authorizedPhonesFromGroups = useMemo(() => {
    const set = new Set<string>();
    for (const lead of authorizedLeads) {
      if (!lead.group_id || !selectedSourceGroupIds.includes(lead.group_id) || !lead.phone) continue;
      const phone = normalizePhone(lead.phone);
      if (phone) set.add(phone);
    }
    return set;
  }, [authorizedLeads, selectedSourceGroupIds]);

  const totalRecipients = useMemo(() => {
    const all = new Set(importedNumbers);
    authorizedPhonesFromGroups.forEach((phone) => all.add(phone));
    return all.size;
  }, [importedNumbers, authorizedPhonesFromGroups]);

  const filteredGroups = useMemo(() => {
    const term = groupSearch.trim().toLowerCase();
    if (!term) return groups;
    return groups.filter((group) => `${group.name || ""} ${group.external_id}`.toLowerCase().includes(term));
  }, [groups, groupSearch]);

  const suggestedSenders = Math.max(1, Math.ceil(totalRecipients / Math.max(1, dailyLimit)));
  const selectedOnline = senderIds.filter((id) => senders.find((s) => s.id === id)?.status === "connected").length;

  function mergeNumbers(numbers: string[], invalid = 0) {
    setImportedNumbers((current) => [...new Set([...current, ...numbers])]);
    setInvalidCount((current) => current + invalid);
  }

  function removeImportedNumber(phone: string) {
    setImportedNumbers((current) => current.filter((item) => item !== phone));
  }

  async function onTxt(file?: File | null) {
    if (!file) return;
    const text = await file.text();
    const parsed = parsePhoneText(text);
    mergeNumbers(parsed.valid, parsed.invalid);
  }

  function usePastedText() {
    const parsed = parsePhoneText(pastedText);
    mergeNumbers(parsed.valid, parsed.invalid);
    setPastedText("");
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
          source_group_ids: selectedSourceGroupIds,
          imported_numbers: importedNumbers,
          start_delay_seconds: Math.round(startDelayMinutes * 60),
          send_interval_seconds: Math.round(intervalSeconds),
          daily_limit_per_sender: Math.round(dailyLimit),
          authorization_confirmed: authorized,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(data?.error || "Falha ao criar disparo privado.");

      setMessage(`Disparo criado com ${data.recipients} destinatário(s). Acompanhe tudo em Operações.`);
      setName("");
      setImportedNumbers([]);
      setInvalidCount(0);
      setPastedText("");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao criar disparo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="topbar">
        <div><h1>Disparo privado</h1><div className="subtitle">Crie o disparo aqui. Controle, fila e histórico ficam 100% na aba Operações.</div></div>
      </div>

      <div className="card automation-card">
        <div className="section-title">Novo disparo privado</div>
        <div className="muted" style={{ marginBottom: 14 }}>Importe somente contatos autorizados. Depois de iniciar, acompanhe e controle o disparo em Operações.</div>

        <div className="field modal-field-gap"><label>Nome do disparo</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Lista VIP Setembro" /></div>

        <div className="section-title modal-field-gap">1. Origem dos contatos</div>
        <div className="form-grid">
          <div className="field">
            <label>Importar números</label>
            <input className="input" type="file" accept=".txt,text/plain" onChange={(e) => onTxt(e.target.files?.[0])} />
            <textarea className="input" style={{ minHeight: 150, marginTop: 10, resize: "vertical" }} value={pastedText} onChange={(e) => setPastedText(e.target.value)} placeholder={"Ou cole aqui o TXT pronto, um número por linha:\n5562999999999\n5562988888888"} />
            <div className="row" style={{ marginTop: 8 }}>
              <div className="muted">Válidos carregados: {importedNumbers.length}{invalidCount ? ` • inválidos ignorados: ${invalidCount}` : ""}</div>
              <button type="button" className="btn secondary" onClick={usePastedText} disabled={!pastedText.trim()}>Adicionar números colados</button>
            </div>

            <div className="card" style={{ marginTop: 10, padding: 10 }}>
              <div className="row" style={{ marginBottom: importedNumbers.length ? 8 : 0 }}>
                <div className="label">Números adicionados</div>
                {importedNumbers.length ? <button type="button" className="btn secondary" style={{ padding: "6px 10px" }} onClick={() => setImportedNumbers([])}>Limpar lista</button> : null}
              </div>
              <div style={{ maxHeight: 180, overflowY: "auto", display: "grid", gap: 6, paddingRight: 4 }}>
                {importedNumbers.map((phone, index) => (
                  <div key={phone} className="row" style={{ justifyContent: "space-between", padding: "7px 9px", border: "1px solid var(--border)", borderRadius: 8 }}>
                    <span style={{ fontFamily: "monospace" }}>{index + 1}. +{phone}</span>
                    <button type="button" className="btn secondary" style={{ padding: "4px 8px" }} onClick={() => removeImportedNumber(phone)}>×</button>
                  </div>
                ))}
                {!importedNumbers.length ? <div className="muted">Os números válidos do arquivo ou do texto colado vão aparecer aqui.</div> : null}
              </div>
            </div>
          </div>

          <div className="field">
            <label>Leads opt-in já capturados dos grupos</label>
            <input className="input" value={groupSearch} onChange={(e) => setGroupSearch(e.target.value)} placeholder="Buscar grupo..." />
            <div style={{ maxHeight: 360, overflowY: "auto", marginTop: 10, paddingRight: 6 }}>
              <div style={{ display: "grid", gap: 8 }}>
                {filteredGroups.map((group) => {
                  const checked = selectedGroupKeys.includes(group.external_id);
                  const ids = group.ids?.length ? group.ids : [group.id];
                  const count = authorizedLeads.filter((lead) => Boolean(lead.group_id && ids.includes(lead.group_id) && lead.phone)).length;
                  return (
                    <label className={`selector-card ${checked ? "selected" : ""}`} key={group.external_id} style={{ minHeight: 0 }}>
                      <input type="checkbox" checked={checked} onChange={() => setSelectedGroupKeys((current) => toggle(current, group.external_id))} />
                      <span><strong>{group.name || group.external_id}</strong><small>{count} lead(s) opt-in disponível(is)</small></span>
                    </label>
                  );
                })}
                {!filteredGroups.length ? <div className="muted">Nenhum grupo encontrado.</div> : null}
              </div>
            </div>
            <div className="muted" style={{ marginTop: 8 }}>{selectedGroupKeys.length} grupo(s) selecionado(s)</div>
          </div>
        </div>

        <div className="section-title modal-field-gap">2. Campanhas em rotação <span className="muted" style={{ fontSize: 12 }}>({campaignIds.length}/5)</span></div>
        <div className="selector-grid">
          {campaigns.map((campaign) => {
            const checked = campaignIds.includes(campaign.id);
            return <label className={`selector-card ${checked ? "selected" : ""}`} key={campaign.id}><input type="checkbox" checked={checked} onChange={() => setCampaignIds((current) => toggle(current, campaign.id, 5))} /><span><strong>{campaign.name}</strong><small>{checked ? `Posição ${campaignIds.indexOf(campaign.id) + 1}` : "Adicionar"}</small></span></label>;
          })}
        </div>

        <div className="section-title modal-field-gap">3. Contas disparadoras</div>
        <div className="selector-grid">
          {senders.map((sender) => {
            const checked = senderIds.includes(sender.id);
            return <label className={`selector-card ${checked ? "selected" : ""}`} key={sender.id}><input type="checkbox" checked={checked} onChange={() => setSenderIds((current) => toggle(current, sender.id))} /><span><strong>{sender.name}</strong><small>{sender.status === "connected" ? "online" : "offline"}{sender.phone ? ` • +${sender.phone}` : ""}</small></span></label>;
          })}
        </div>

        <div className="form-grid modal-field-gap">
          <div className="field"><label>Esperar antes do primeiro envio (min)</label><input className="input" type="number" min={0} value={startDelayMinutes} onChange={(e) => setStartDelayMinutes(Math.max(0, Number(e.target.value || 0)))} /></div>
          <div className="field"><label>Intervalo entre envios (seg)</label><input className="input" type="number" min={1} value={intervalSeconds} onChange={(e) => setIntervalSeconds(Math.max(1, Number(e.target.value || 1)))} /></div>
          <div className="field"><label>Limite diário interno por conta</label><input className="input" type="number" min={1} value={dailyLimit} onChange={(e) => setDailyLimit(Math.max(1, Number(e.target.value || 1)))} /></div>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <div className="row"><div><div className="label">Planejamento</div><div style={{ fontSize: 28, fontWeight: 900 }}>{totalRecipients} contatos</div><div className="muted">Com limite interno de {dailyLimit}/dia por conta, a sugestão operacional é {suggestedSenders} conta(s). Você selecionou {senderIds.length} ({selectedOnline} online).</div></div><span className={`badge ${senderIds.length >= suggestedSenders ? "ok" : "warn"}`}>{senderIds.length >= suggestedSenders ? "Capacidade suficiente" : `Considere +${suggestedSenders - senderIds.length} conta(s)`}</span></div>
        </div>

        <label className="check-row modal-field-gap"><input type="checkbox" checked={authorized} onChange={(e) => setAuthorized(e.target.checked)} /><span><strong>Contatos autorizados</strong><small>Confirmo que os números importados e selecionados deram consentimento para receber mensagens privadas desta empresa.</small></span></label>
        {message ? <div className="subtitle" style={{ marginTop: 14 }}>{message}</div> : null}
        <button className="btn modal-field-gap" onClick={createBroadcast} disabled={busy || !totalRecipients || !campaignIds.length || !senderIds.length}>{busy ? "Criando..." : "Criar e iniciar disparo"}</button>
      </div>
    </>
  );
}
