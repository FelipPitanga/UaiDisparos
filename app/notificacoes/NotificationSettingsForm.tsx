"use client";

import { useState } from "react";

type Settings = {
  group_sent_url: string | null;
  private_sent_url: string | null;
  disconnected_url: string | null;
};

type Props = { initialSettings: Settings };

export default function NotificationSettingsForm({ initialSettings }: Props) {
  const [groupSentUrl, setGroupSentUrl] = useState(initialSettings.group_sent_url || "");
  const [privateSentUrl, setPrivateSentUrl] = useState(initialSettings.private_sent_url || "");
  const [disconnectedUrl, setDisconnectedUrl] = useState(initialSettings.disconnected_url || "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/notifications/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          group_sent_url: groupSentUrl,
          private_sent_url: privateSentUrl,
          disconnected_url: disconnectedUrl,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(data?.error || "Não foi possível salvar.");
      setMessage("Webhooks salvos. Os próximos eventos já usarão essas URLs.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao salvar webhooks.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card automation-card">
      <div className="section-title">Pushcut</div>
      <div className="muted" style={{ marginBottom: 18 }}>
        Cole a URL de webhook de cada notificação. Pode deixar qualquer campo em branco para desativar aquele aviso.
      </div>

      <div className="field">
        <label>Mensagem enviada no grupo — link</label>
        <input
          className="input"
          type="url"
          value={groupSentUrl}
          onChange={(event) => setGroupSentUrl(event.target.value)}
          placeholder="https://..."
          autoComplete="off"
        />
        <div className="muted" style={{ marginTop: 6 }}>Dispara quando um envio automático do fluxo de grupo for concluído.</div>
      </div>

      <div className="field modal-field-gap">
        <label>Mensagem enviada no privado — link</label>
        <input
          className="input"
          type="url"
          value={privateSentUrl}
          onChange={(event) => setPrivateSentUrl(event.target.value)}
          placeholder="https://..."
          autoComplete="off"
        />
        <div className="muted" style={{ marginTop: 6 }}>Dispara quando um envio do Disparo Privado for concluído.</div>
      </div>

      <div className="field modal-field-gap">
        <label>Número desconectou — link</label>
        <input
          className="input"
          type="url"
          value={disconnectedUrl}
          onChange={(event) => setDisconnectedUrl(event.target.value)}
          placeholder="https://..."
          autoComplete="off"
        />
        <div className="muted" style={{ marginTop: 6 }}>Dispara quando o sistema detectar que uma instância saiu do estado conectado.</div>
      </div>

      {message ? <div className="subtitle" style={{ marginTop: 14 }}>{message}</div> : null}
      <button className="btn modal-field-gap" onClick={save} disabled={busy}>
        {busy ? "Salvando..." : "Salvar webhooks"}
      </button>
    </div>
  );
}
