"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type InstanceRow = {
  id: string;
  name: string;
  status: string;
  instance_role: "monitor" | "sender" | "both";
  phone: string | null;
  last_seen_at: string | null;
  created_at: string;
};

type Props = {
  initialInstances: InstanceRow[];
};

function roleLabel(role: InstanceRow["instance_role"]) {
  if (role === "monitor") return "Monitorador";
  if (role === "both") return "Monitorador + Disparador";
  return "Disparador";
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

export default function InstancesManager({ initialInstances }: Props) {
  const router = useRouter();
  const [instances, setInstances] = useState(initialInstances);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState<InstanceRow["instance_role"]>("sender");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [connectId, setConnectId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string>("disconnected");

  const selected = useMemo(
    () => instances.find((instance) => instance.id === connectId) ?? null,
    [instances, connectId],
  );

  useEffect(() => {
    if (!connectId || connectionStatus !== "connecting") return;

    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/uazapi/instances/${connectId}/status`, { cache: "no-store" });
        const data = await response.json();
        if (!data?.ok) return;

        setConnectionStatus(data.status);
        if (data.qrcode) setQrCode(data.qrcode);
        setInstances((current) =>
          current.map((item) =>
            item.id === connectId
              ? { ...item, status: data.status, phone: data.phone ? String(data.phone).replace(/\D/g, "") : item.phone }
              : item,
          ),
        );

        if (data.status === "connected") {
          setQrCode(null);
          setPairCode(null);
          router.refresh();
        }
      } catch {
        // Mantém o polling; falhas temporárias não interrompem a tentativa.
      }
    }, 3000);

    return () => window.clearInterval(timer);
  }, [connectId, connectionStatus, router]);

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

      const created: InstanceRow = {
        ...data.instance,
        phone: data.instance.phone ?? null,
        last_seen_at: null,
      };

      setInstances((current) => [created, ...current]);
      setShowCreate(false);
      setName("");
      setRole("sender");
      setConnectId(created.id);
      setConnectionStatus(created.status);
      await generateQr(created.id);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar instância.");
    } finally {
      setBusy(false);
    }
  }

  async function generateQr(id: string) {
    setConnectId(id);
    setQrCode(null);
    setPairCode(null);
    setConnectionStatus("connecting");
    setError("");

    try {
      const response = await fetch(`/api/uazapi/instances/${id}/connect`, { method: "POST" });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(data?.error || "Não foi possível gerar o QR Code.");

      setQrCode(data.qrcode ?? null);
      setPairCode(data.pairCode ?? null);
      setConnectionStatus(data.status ?? "connecting");
      setInstances((current) =>
        current.map((item) => (item.id === id ? { ...item, status: data.status ?? "connecting" } : item)),
      );
    } catch (err) {
      setConnectionStatus("error");
      setError(err instanceof Error ? err.message : "Erro ao gerar QR Code.");
    }
  }

  async function deleteInstance(instance: InstanceRow) {
    const confirmed = window.confirm(
      `Excluir a instância "${instance.name}"?\n\nIsso remove a instância da UAZAPI e também do UaiDisparos.`,
    );
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

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Instâncias</h1>
          <div className="subtitle">Crie, conecte e organize os números da operação.</div>
        </div>
        <button className="btn" onClick={() => { setError(""); setShowCreate(true); }}>+ Nova instância</button>
      </div>

      <div className="instance-summary-grid">
        <div className="card"><div className="label">Total</div><div className="metric">{instances.length}</div></div>
        <div className="card"><div className="label">Conectadas</div><div className="metric">{instances.filter((x) => x.status === "connected").length}</div></div>
        <div className="card"><div className="label">Monitoradores</div><div className="metric">{instances.filter((x) => x.instance_role === "monitor" || x.instance_role === "both").length}</div></div>
        <div className="card"><div className="label">Disparadores</div><div className="metric">{instances.filter((x) => x.instance_role === "sender" || x.instance_role === "both").length}</div></div>
      </div>

      {error ? <div className="alert-error">{error}</div> : null}

      <div className="section instance-cards">
        {instances.length === 0 ? (
          <div className="card empty-state">
            <div className="section-title">Nenhuma instância criada</div>
            <div className="muted">Crie a primeira instância e conecte o WhatsApp pelo QR Code.</div>
          </div>
        ) : instances.map((instance) => (
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
              <button
                className="btn instance-action"
                onClick={() => generateQr(instance.id)}
                disabled={instance.status === "connected" || deletingId === instance.id}
              >
                {instance.status === "connected" ? "WhatsApp conectado" : "Gerar QR Code"}
              </button>
              <button
                className="btn danger-btn"
                onClick={() => deleteInstance(instance)}
                disabled={deletingId === instance.id}
                title="Excluir instância"
              >
                {deletingId === instance.id ? "Excluindo..." : "Excluir"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {showCreate ? (
        <div className="modal-backdrop" onMouseDown={() => !busy && setShowCreate(false)}>
          <div className="modal-card" onMouseDown={(event) => event.stopPropagation()}>
            <div className="row modal-title-row">
              <div>
                <div className="section-title">Nova instância</div>
                <div className="muted">A instância será criada direto no seu servidor UAZAPI.</div>
              </div>
              <button className="modal-close" onClick={() => setShowCreate(false)} disabled={busy}>×</button>
            </div>
            <div className="field">
              <label>Nome</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Monitor X" autoFocus />
            </div>
            <div className="field modal-field-gap">
              <label>Função</label>
              <select className="select" value={role} onChange={(e) => setRole(e.target.value as InstanceRow["instance_role"])}>
                <option value="monitor">Monitorador</option>
                <option value="sender">Disparador</option>
                <option value="both">Monitorador + Disparador</option>
              </select>
            </div>
            {error ? <div className="alert-error compact">{error}</div> : null}
            <div className="modal-actions">
              <button className="btn secondary" onClick={() => setShowCreate(false)} disabled={busy}>Cancelar</button>
              <button className="btn" onClick={createInstance} disabled={busy}>{busy ? "Criando..." : "Criar instância"}</button>
            </div>
          </div>
        </div>
      ) : null}

      {connectId ? (
        <div className="modal-backdrop" onMouseDown={() => setConnectId(null)}>
          <div className="modal-card qr-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="row modal-title-row">
              <div>
                <div className="section-title">Conectar {selected?.name ?? "instância"}</div>
                <div className="muted">WhatsApp → Aparelhos conectados → Conectar um aparelho.</div>
              </div>
              <button className="modal-close" onClick={() => setConnectId(null)}>×</button>
            </div>

            {connectionStatus === "connected" ? (
              <div className="connection-success">
                <div className="success-icon">✓</div>
                <div className="section-title">Conectado com sucesso</div>
                <div className="muted">A instância já está pronta para uso no UaiDisparos.</div>
              </div>
            ) : qrCode ? (
              <div className="qr-content">
                <div className="qr-frame"><img src={qrCode} alt="QR Code do WhatsApp" /></div>
                <div className="muted">O status atualiza automaticamente após a leitura.</div>
              </div>
            ) : pairCode ? (
              <div className="qr-content">
                <div className="pair-code">{pairCode}</div>
                <div className="muted">Use este código no WhatsApp para vincular o aparelho.</div>
              </div>
            ) : (
              <div className="qr-content">
                <div className="qr-loading">Gerando QR Code...</div>
              </div>
            )}

            {connectionStatus !== "connected" ? (
              <button className="btn secondary full-btn" onClick={() => connectId && generateQr(connectId)}>Gerar novo QR</button>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
