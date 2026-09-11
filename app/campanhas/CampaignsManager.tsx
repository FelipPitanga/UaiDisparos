"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type ButtonItem = { id: string; label: string; value: string; type: "reply" | "url" | "call" | "copy" };
type Campaign = {
  id: string;
  name: string;
  status: string;
  text_content: string | null;
  media_url: string | null;
  media_type: string | null;
  footer_text: string | null;
  buttons: ButtonItem[];
};

type Props = { initialCampaigns: Campaign[] };

const emptyButtons: ButtonItem[] = [
  { id: "btn_1", label: "", value: "", type: "reply" },
  { id: "btn_2", label: "", value: "", type: "url" },
  { id: "btn_3", label: "", value: "", type: "reply" },
];

function buttonIcon(type: ButtonItem["type"]) {
  if (type === "url") return "↗";
  if (type === "call") return "☎";
  if (type === "copy") return "⧉";
  return "↩";
}

export default function CampaignsManager({ initialCampaigns }: Props) {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [text, setText] = useState("Olá {{telefone}} 👋\n\nBem-vindo ao grupo {{grupo}}.\n\nClique no link abaixo e finalize sua inscrição!");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaType, setMediaType] = useState("none");
  const [footerText, setFooterText] = useState("");
  const [buttons, setButtons] = useState<ButtonItem[]>(emptyButtons);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const preview = useMemo(() => text
    .replace(/{{\s*nome\s*}}/gi, "João")
    .replace(/{{\s*telefone\s*}}/gi, "5562999999999")
    .replace(/{{\s*grupo\s*}}/gi, "Grupo Exemplo")
    .replace(/{{\s*data\s*}}/gi, "11/09/2026")
    .replace(/{{\s*hora\s*}}/gi, "18:00"), [text]);

  const activeButtons = useMemo(() => buttons.filter((b) => b.label.trim() && b.value.trim()), [buttons]);

  function resetForm() {
    setEditingId(null);
    setName("");
    setText("Olá {{telefone}} 👋\n\nBem-vindo ao grupo {{grupo}}.\n\nClique no link abaixo e finalize sua inscrição!");
    setMediaUrl("");
    setMediaType("none");
    setFooterText("");
    setButtons(emptyButtons);
    setError("");
  }

  function editCampaign(campaign: Campaign) {
    setEditingId(campaign.id);
    setName(campaign.name);
    setText(campaign.text_content || "");
    setMediaUrl(campaign.media_url || "");
    setMediaType(campaign.media_type || "none");
    setFooterText(campaign.footer_text || "");
    const next = [...(campaign.buttons || [])];
    while (next.length < 3) next.push({ ...emptyButtons[next.length] });
    setButtons(next.slice(0, 3));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveCampaign() {
    setBusy(true);
    setError("");
    try {
      const payload = {
        name,
        text_content: text,
        media_url: mediaUrl,
        media_type: mediaUrl ? mediaType : "none",
        footer_text: footerText,
        buttons: activeButtons,
        status: "active",
      };
      const response = await fetch(editingId ? `/api/campaigns/${editingId}` : "/api/campaigns", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(data?.error || "Falha ao salvar campanha.");
      if (editingId) setCampaigns((current) => current.map((c) => c.id === editingId ? data.campaign : c));
      else setCampaigns((current) => [data.campaign, ...current]);
      resetForm();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar campanha.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteCampaign(id: string) {
    if (!window.confirm("Excluir esta campanha?")) return;
    const response = await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok || !data?.ok) {
      setError(data?.error || "Falha ao excluir campanha.");
      return;
    }
    setCampaigns((current) => current.filter((c) => c.id !== id));
    if (editingId === id) resetForm();
    router.refresh();
  }

  function updateButton(index: number, key: keyof ButtonItem, value: string) {
    setButtons((current) => current.map((button, i) => i === index ? { ...button, [key]: value } : button));
  }

  return (
    <>
      <div className="topbar">
        <div><h1>Campanhas</h1><div className="subtitle">Crie a mensagem uma vez e reutilize nas automações.</div></div>
        {editingId ? <button className="btn secondary" onClick={resetForm}>Nova campanha</button> : null}
      </div>

      <div className="campaign-builder-grid">
        <div className="card">
          <div className="section-title">{editingId ? "Editar campanha" : "Nova campanha"}</div>
          <div className="field modal-field-gap"><label>Nome</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Boas-vindas Oferta 01" /></div>

          <div className="field modal-field-gap">
            <label>Mensagem</label>
            <textarea className="textarea" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="Digite sua mensagem..." />
            <div className="muted code-help">Variáveis: {"{{nome}}"}, {"{{telefone}}"}, {"{{grupo}}"}, {"{{data}}"}, {"{{hora}}"}</div>
          </div>

          <div className="form-grid modal-field-gap">
            <div className="field"><label>Tipo de mídia</label><select className="select" value={mediaType} onChange={(e) => setMediaType(e.target.value)}><option value="none">Sem mídia</option><option value="image">Imagem</option><option value="video">Vídeo</option><option value="audio">Áudio</option><option value="ptt">Áudio PTT</option><option value="document">Documento</option><option value="sticker">Sticker</option></select></div>
            <div className="field"><label>URL da mídia</label><input className="input" value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="https://..." /></div>
          </div>

          <div className="field modal-field-gap"><label>Rodapé dos botões</label><input className="input" value={footerText} onChange={(e) => setFooterText(e.target.value)} placeholder="Opcional" /></div>

          <div className="section-title modal-field-gap">Botões interativos</div>
          <div className="muted code-help">Até 3 botões. Para URL use o link; para chamada use o telefone; para copiar use o código.</div>
          {buttons.map((button, index) => (
            <div className="button-editor-row" key={button.id}>
              <input className="input" value={button.label} onChange={(e) => updateButton(index, "label", e.target.value)} placeholder={`Texto do botão ${index + 1}`} />
              <select className="select" value={button.type} onChange={(e) => updateButton(index, "type", e.target.value as ButtonItem["type"])}><option value="reply">Resposta</option><option value="url">Link</option><option value="call">Ligar</option><option value="copy">Copiar</option></select>
              <input className="input" value={button.value} onChange={(e) => updateButton(index, "value", e.target.value)} placeholder={button.type === "url" ? "https://..." : button.type === "call" ? "+5562..." : button.type === "copy" ? "CUPOM10" : "Não obrigatório"} />
            </div>
          ))}

          {error ? <div className="alert-error compact modal-field-gap">{error}</div> : null}
          <button className="btn full-btn modal-field-gap" onClick={saveCampaign} disabled={busy}>{busy ? "Salvando..." : editingId ? "Salvar alterações" : "Criar campanha"}</button>
        </div>

        <div className="card campaign-preview">
          <div className="section-title">Prévia da conversa</div>
          <div className="wa-phone">
            <div className="wa-header">
              <div className="wa-avatar">U</div>
              <div className="wa-contact"><strong>UaiDisparos</strong><span>online</span></div>
              <div className="wa-header-icons">⌕ ⋮</div>
            </div>
            <div className="wa-chat">
              <div className="wa-date">HOJE</div>
              <div className="wa-bubble incoming">Oi, acabei de entrar no grupo 👋<span className="wa-time">17:59</span></div>
              <div className="wa-bubble outgoing">
                {mediaUrl ? (
                  <div className="wa-media">
                    {mediaType === "image" ? <img src={mediaUrl} alt="Prévia da mídia" /> : <div className="wa-media-placeholder">{mediaType.toUpperCase()}<small>{mediaUrl}</small></div>}
                  </div>
                ) : null}
                <div className="wa-message-text">{preview || "Sua mensagem aparece aqui."}</div>
                {footerText ? <div className="wa-footer">{footerText}</div> : null}
                <span className="wa-time">18:00 ✓✓</span>
                {activeButtons.length ? (
                  <div className="wa-actions">
                    {activeButtons.map((button) => (
                      <div className="wa-action-button" key={button.id}>
                        <span>{buttonIcon(button.type)}</span>{button.label}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="wa-composer"><span>＋</span><div>Mensagem</div><span>◉</span><span>🎤</span></div>
          </div>
        </div>
      </div>

      <div className="section" style={{ marginTop: 26 }}>
        <div className="section-title">Campanhas salvas</div>
        <div className="instance-cards" style={{ marginTop: 12 }}>
          {campaigns.map((campaign) => (
            <div className="card instance-card" key={campaign.id}>
              <div className="row"><div><div className="instance-name">{campaign.name}</div><div className="muted">{campaign.media_type && campaign.media_type !== "none" ? campaign.media_type : "texto"} • {(campaign.buttons || []).length} botão(ões)</div></div><span className="badge ok">Ativa</span></div>
              <div className="muted campaign-snippet">{campaign.text_content || "Sem texto"}</div>
              <div className="instance-actions-row"><button className="btn instance-action" onClick={() => editCampaign(campaign)}>Editar</button><button className="btn danger-btn" onClick={() => deleteCampaign(campaign.id)}>Excluir</button></div>
            </div>
          ))}
          {!campaigns.length ? <div className="card empty-state">Nenhuma campanha criada ainda.</div> : null}
        </div>
      </div>
    </>
  );
}
