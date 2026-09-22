"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type InstanceRole = "monitor" | "sender";

type InstanceRow = {
  id: string;
  name: string;
  status: string;
  instance_role: InstanceRole;
  phone: string | null;
  last_seen_at: string | null;
  created_at: string;
};

type Props = { initialInstances: InstanceRow[]; canChooseRole?: boolean };

function roleLabel(role: InstanceRole) {
  return role === "monitor" ? "Monitorador" : "Disparador";
}

function statusLabel(status: string) {
  if (status === "connected") return "Conectada";
  if (status === "connecting") return "Aguardando conexão";
  if (status === "hibernated") return "Hibernada";
  if (status === "error") return "Erro";
  return "Desconectada";
}

function statusClass(status: string) {
  if (status === "connected") return "ok";
  if (status === "connecting" || status === "hibernated") return "warn";
  if (status === "error") return "bad";
  return "";
}

export default function InstancesManager({ initialInstances, canChooseRole = true }: Props) {
  const router = useRouter();
  const [instances, setInstances] = useState(initialInstances);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState<InstanceRole>("sender");
  const [busy, setBusy] = useState(false);
  const [connectBusy, setConnectBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [connectId, setConnectId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [phoneForCode, setPhoneForCode] = useState("");
  const [connectMode, setConnectMode] = useState<"qr" | "code">("qr");
  const [connectionStatus, setConnectionStatus] = useState<string>("disconnected");

  const selected = useMemo(
    () => instances.find((instance) => instance.id === connectId) ?? null,
    [instances, connectId],
  );

  const monitors = useMemo(() => instances.filter((x) => x.instance_role === "monitor"), [instances]);
  const senders = useMemo(() => instances.filter((x) => x.instance_role === "sender"), [instances]);

  useEffect(() => {
    if (!connectId || connectionStatus !== "connecting") return;

    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/uazapi/instances/${connectId}/status`, { cache: "no-store" });
        const data = await response.json();
        if (!data?.ok) return;

        setConnectionStatus(data.status);
        if (connectMode === "qr" && data.qrcode) setQrCode(data.qrcode);
        setInstances((current) => current.map((item) =>
          item.id === connectId
            ? { ...item, status: data.status, phone: data.phone ? String(data.phone).replace(/\D/g, "") : item.phone }
            : item,
        ));

        if (data.status === "connected") {
          setQrCode(null);
          setPairCode(null);
          router.refresh();
        }
      } catch {}
    }, 3000);

    return () => window.clearInterval(timer);
  }, [connectId, connectionStatus, router, connectMode]);

  async function createInstance() {
    if (!name.trim()) {
      setError("Dá um nome para a instância primeiro.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/uazapi/instances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), role }),
      });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(data?.error || "Não foi possível criar a instância.");

      const created: InstanceRow = { ...data.instance, phone: data.instance.phone ?? null, last_seen_at: null };
      setInstances((current) => [created, ...current]);
      setShowCreate(false);
      setName("");
      setRole("sender");
      setConnectId(created.id);
      setConnectionStatus("disconnected");
      setConnectMode("qr");
      setPhoneForCode("");
      setQrCode(null);
      setPairCode(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar instância.");
    } finally {
      setBusy(false);
    }
  }

  async function connectInstance(id: string, mode: "qr" | "code", reset = false) {
    const phone = phoneForCode.replace(/\D/g, "");
    if (mode === "code" && phone.length < 10) {
      setError("Informe o número com DDI + DDD. Ex.: 5562999999999.");
      return;
    }

    setConnectBusy(true);
    setConnectId(id);
    setConnectMode(mode);
    setQrCode(null);
    if (!reset) setPairCode(null);
    setConnectionStatus("connecting");
    setError("");

    try {
      const response = await fetch(`/api/uazapi/instances/${id}/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "code" ? { phone, reset } : {}),
      });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(data?.error || "Não foi possível iniciar a conexão.");

      if (mode === "code") {
        setQrCode(null);
        setPairCode(data.pairCode ?? null);
      } else {
        setPairCode(null);
        setQrCode(data.qrcode ?? null);
      }

      setConnectionStatus(data.status ?? "connecting");
      setInstances((current) => current.map((item) =>
        item.id === id ? { ...item, status: data.status ?? "connecting" } : item,
      ));
    } catch (err) {
      setConnectionStatus("error");
      setQrCode(null);
      if (!reset) setPairCode(null);
      setError(err instanceof Error ? err.message : "Erro ao iniciar conexão.");
    } finally {
      setConnectBusy(false);
    }
  }

  async function deleteInstance(instance: InstanceRow) {
    const confirmed = window.confirm(`Excluir a instância "${instance.name}"?\n\nIsso remove a instância da UAZAPI e também do UaiDisparos.`);
    if (!confirmed) return;

    setDeletingId(instance.id);
    setError("");
    try {
      const response = await fetch(`/api/uazapi/instances/${instance.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(data?.error || "Não foi possível excluir a instância.");
      setInstances((current) => current.filter((item) => item.id !== instance.id));
      if (connectId === instance.id) setConnectId(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir instância.");
    } finally {
      setDeletingId(null);
    }
  }

  function openConnect(instance: InstanceRow) {
    setConnectId(instance.id);
    setConnectMode("qr");
    setPhoneForCode("");
    setQrCode(null);
    setPairCode(null);
    setConnectionStatus(instance.status === "connected" ? "connected" : "disconnected");
    setError("");
  }

  function renderCards(items: InstanceRow[], emptyMessage: string) {
    if (!items.length) {
      return <div className="card empty-state"><div className="muted">{emptyMessage}</div></div>;
    }

    return items.map((instance) => (
      <div className="card instance-card" key={instance.id}>
        <div className="row">
          <div>
            <div className="instance-name">{instance.name}</div>
            <div className="muted instance-phone">{instance.phone ? `+${instance.phone}` : "Sem número conectado"}</div>
          </div>
          <span className={`badge ${statusClass(instance.status)}`}>{statusLabel(instance.status)}</span>
        </div>
        <div className="instance-meta">
          <span className="badge">{roleLabel(instance.instance_role)}</span>
          <span className="badge">UAZAPI</span>
        </div>
        <div className="instance-actions-row">
          <button className="btn instance-action" onClick={() => openConnect(instance)} disabled={instance.status === "connected" || deletingId === instance.id}>
            {instance.status === "connected" ? "WhatsApp conectado" : "Conectar WhatsApp"}
          </button>
          <button className="btn danger-btn" onClick={() => deleteInstance(instance)} disabled={deletingId === instance.id} title="Excluir instância">
            {deletingId === instance.id ? "Excluindo..." : "Excluir"}
          </button>
        </div>
      </div>
    ));
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Instâncias</h1>
          <div className="subtitle">Monitoradores observam grupos. Disparadores ficam reservados somente para a fila de envio.</div>
        </div>
        <button className="btn" onClick={() => { setError(""); setShowCreate(true); }}>+ Nova instância</button>
      </div>

      <div className="instance-summary-grid">
        <div className="card"><div className="label">Total</div><div className="metric">{instances.length}</div></div>
        <div className="card"><div className="label">Online</div><div className="metric">{instances.filter((x) => x.status === "connected").length}</div></div>
        <div className="card"><div className="label">Monitoradores</div><div className="metric">{monitors.filter((x) => x.status === "connected").length}/{monitors.length}</div><div className="muted">online / total</div></div>
        <div className="card"><div className="label">Disparadores</div><div className="metric">{senders.filter((x) => x.status === "connected").length}/{senders.length}</div><div className="muted">online / total</div></div>
      </div>

      {error ? <div className="alert-error">{error}</div> : null}

      <div className="section">
        <div className="section-title">Monitoradores</div>
        <div className="subtitle" style={{ marginBottom: 12 }}>Só capturam entradas e saídas dos grupos monitorados. Não entram no pool de disparo.</div>
        <div className="instance-cards">{renderCards(monitors, "Nenhum monitorador criado ainda.")}</div>
      </div>

      <div className="section">
        <div className="section-title">Disparadores</div>
        <div className="subtitle" style={{ marginBottom: 12 }}>Ficam disponíveis exclusivamente para a fila de envio. Não são usados para monitorar grupos.</div>
        <div className="instance-cards">{renderCards(senders, "Nenhum disparador criado ainda.")}</div>
      </div>

      {showCreate ? (
        <div className="modal-backdrop" onMouseDown={() => !busy && setShowCreate(false)}>
          <div className="modal-card" onMouseDown={(event) => event.stopPropagation()}>
            <div className="row modal-title-row">
              <div><div className="section-title">Nova instância</div><div className="muted">Escolha uma função única. A instância será criada direto no seu servidor UAZAPI.</div></div>
              <button className="modal-close" onClick={() => setShowCreate(false)} disabled={busy}>×</button>
            </div>
            <div className="field"><label>Nome</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={role === "monitor" ? "Ex.: Monitor X" : "Ex.: Disparador 1"} autoFocus /></div>
            {canChooseRole ? (
              <div className="field modal-field-gap">
                <label>Função</label>
                <select className="select" value={role} onChange={(e) => setRole(e.target.value as InstanceRole)}>
                  <option value="monitor">Monitorador</option>
                  <option value="sender">Disparador</option>
                </select>
                <div className="muted code-help">Monitorador observa grupos. Disparador só participa da fila de envio.</div>
              </div>
            ) : (
              <div className="field modal-field-gap">
                <label>Função</label>
                <div className="badge ok">Disparador</div>
                <div className="muted code-help">As conexões deste acesso entram automaticamente no pool de disparo da operação.</div>
              </div>
            )}
            {error ? <div className="alert-error compact">{error}</div> : null}
            <div className="modal-actions"><button className="btn secondary" onClick={() => setShowCreate(false)} disabled={busy}>Cancelar</button><button className="btn" onClick={createInstance} disabled={busy}>{busy ? "Criando..." : "Criar instância"}</button></div>
          </div>
        </div>
      ) : null}

      {connectId ? (
        <div className="modal-backdrop" onMouseDown={() => !connectBusy && setConnectId(null)}>
          <div className="modal-card qr-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="row modal-title-row"><div><div className="section-title">Conectar {selected?.name ?? "instância"}</div><div className="muted">Escolha QR Code ou código de pareamento.</div></div><button className="modal-close" onClick={() => setConnectId(null)} disabled={connectBusy}>×</button></div>

            {connectionStatus === "connected" ? (
              <div className="connection-success"><div className="success-icon">✓</div><div className="section-title">Conectado com sucesso</div><div className="muted">A instância já está pronta para uso no UaiDisparos.</div></div>
            ) : (
              <>
                <div className="connect-methods">
                  <button className={`btn ${connectMode === "qr" ? "" : "secondary"}`} disabled={connectBusy} onClick={() => { setConnectMode("qr"); setQrCode(null); setPairCode(null); setError(""); }}>QR Code</button>
                  <button className={`btn ${connectMode === "code" ? "" : "secondary"}`} disabled={connectBusy} onClick={() => { setConnectMode("code"); setQrCode(null); setPairCode(null); setError(""); }}>Código</button>
                </div>

                {connectMode === "code" ? (
                  <div className="field modal-field-gap">
                    <label>Número do WhatsApp</label>
                    <input className="input" disabled={connectBusy} value={phoneForCode} onChange={(e) => setPhoneForCode(e.target.value)} placeholder="5562999999999" inputMode="numeric" />
                    <div className="muted code-help">Use DDI + DDD + número, somente números.</div>
                  </div>
                ) : null}

                {connectMode === "qr" && qrCode ? (
                  <div className="qr-content"><div className="qr-frame"><img src={qrCode} alt="QR Code do WhatsApp" /></div><div className="muted">WhatsApp → Aparelhos conectados → Conectar um aparelho.</div></div>
                ) : null}

                {connectMode === "code" && pairCode ? (
                  <div className="qr-content"><div className="pair-code">{pairCode}</div><div className="muted">No WhatsApp, escolha conectar com número de telefone e digite este código.</div></div>
                ) : null}

                {error ? <div className="alert-error compact">{error}</div> : null}

                <button
                  className="btn full-btn modal-field-gap"
                  disabled={connectBusy}
                  onClick={() => connectId && connectInstance(connectId, connectMode, connectMode === "code" && Boolean(pairCode))}
                >
                  {connectBusy
                    ? (connectMode === "code" ? "Gerando código..." : "Gerando QR...")
                    : connectMode === "code"
                      ? (pairCode ? "Gerar novo código" : "Gerar código de pareamento")
                      : "Gerar QR Code"}
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
