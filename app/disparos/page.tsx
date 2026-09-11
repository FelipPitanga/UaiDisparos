"use client";

import { useState } from "react";

export default function DisparosPage() {
  const [number, setNumber] = useState("");
  const [text, setText] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaType, setMediaType] = useState("image");
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");

  async function handleSend() {
    try {
      setLoading(true);
      setResult("");
      const response = await fetch("/api/uazapi/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number, text, mediaUrl, mediaType, authorized }),
      });

      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Falha no envio.");
      setResult("Mensagem enviada com sucesso.");
    } catch (error) {
      setResult(error instanceof Error ? error.message : "Erro ao enviar mensagem.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Disparos</h1>
          <div className="subtitle">Teste de envio direto pela instância UAZAPI conectada.</div>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 820 }}>
        <div className="form-grid">
          <div className="field">
            <label>Número / Chat ID</label>
            <input
              className="input"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="5562999999999"
            />
          </div>
          <div className="field">
            <label>Tipo de mídia</label>
            <select className="select" value={mediaType} onChange={(e) => setMediaType(e.target.value)}>
              <option value="image">Imagem</option>
              <option value="video">Vídeo</option>
              <option value="audio">Áudio</option>
              <option value="ptt">Áudio PTT</option>
              <option value="document">Documento</option>
              <option value="sticker">Sticker</option>
            </select>
          </div>
        </div>

        <div className="field" style={{ marginTop: 14 }}>
          <label>Mensagem</label>
          <textarea
            className="textarea"
            rows={7}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Digite a mensagem de teste..."
          />
        </div>

        <div className="field" style={{ marginTop: 14 }}>
          <label>URL da mídia (opcional)</label>
          <input
            className="input"
            value={mediaUrl}
            onChange={(e) => setMediaUrl(e.target.value)}
            placeholder="https://..."
          />
        </div>

        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 16 }}>
          <input type="checkbox" checked={authorized} onChange={(e) => setAuthorized(e.target.checked)} />
          <span className="muted">Confirmo que este destinatário autorizou o contato ou é um número de teste meu.</span>
        </label>

        <div className="toolbar" style={{ marginTop: 18, alignItems: "center" }}>
          <button className="btn" onClick={handleSend} disabled={loading || !authorized}>
            {loading ? "Enviando..." : "Enviar teste"}
          </button>
          {result ? <span className="subtitle" style={{ marginTop: 0 }}>{result}</span> : null}
        </div>
      </div>
    </>
  );
}
