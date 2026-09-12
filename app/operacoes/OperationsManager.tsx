"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Sender = { id: string; name: string; phone: string | null; status: string };
type Campaign = { id: string; name: string };
type Contact = {
  id: string;
  phone: string | null;
  status: string;
  campaign_name: string | null;
  sender_name: string | null;
  detail: string | null;
  processed_at: string | null;
  scheduled_at: string | null;
};

type Operation = {
  id: string;
  type: "group" | "private";
  title: string;
  subtitle: string | null;
  active: boolean;
  campaigns: Campaign[];
  senders: Sender[];
  contacts: Contact[];
};

type Props = { operations: Operation[] };

function badgeClass(status: string) {
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

function fmt(value: string | null) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "America/Sao_Paulo",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function OperationsManager({ operations }: Props) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(operations[0]?.id ?? null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const visible = useMemo(() => operations, [operations]);
  const active = useMemo(() => visible.filter((x) => x.active), [visible]);
  const totalQueued = visible.reduce((sum, op) => sum + op.contacts.filter((x) => x.status === "queued").length, 0);
  const totalSent = visible.reduce((sum, op) => sum + op.contacts.filter((x) => x.status === "sent").length, 0);
  const totalFailed = visible.reduce((sum, op) => sum + op.contacts.filter((x) => x.status === "failed").length, 0);

  async function toggleOperation(op: Operation) {
    setBusyId(op.id);
    setError("");
    try {
      const url = op.type === "private" ? `/api/private-broadcasts/${op.id}` : `/api/automations/${op.id}`;
      const body = op.type === "private" ? { status: op.active ? "paused" : "active" } : { active: !op.active };
      const response = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(data?.error || "Falha ao atualizar operação.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar operação.");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteOperation(op: Operation) {
    if (!window.confirm(`Excluir o disparo \"${op.title}\"?`)) return;
    setBusyId(op.id);
    setError("");
    try {
      const url = op.type === "private" ? `/api/private-broadcasts/${op.id}` : `/api/automations/${op.id}`;
      const response = await fetch(url, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(data?.error || "Falha ao excluir operação.");
      if (openId === op.id) setOpenId(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir operação.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Operações</h1>
          <div className="subtitle">Controle, fila e histórico de todos os disparos em um único lugar.</div>
        </div>
        <span className="badge ok">● Ao vivo</span>
      </div>

      <div className="instance-summary-grid">
        <div className="card"><div className="label">Operações ativas</div><div className="metric">{active.length}</div></div>
        <div className="card"><div className="label">Aguardando</div><div className="metric">{totalQueued}</div></div>
        <div className="card"><div className="label">Enviados</div><div className="metric">{totalSent}</div></div>
        <div className="card"><div className="label">Erros</div><div className="metric">{totalFailed}</div></div>
      </div>

      {error ? <div className="alert-error" style={{ marginTop: 16 }}>{error}</div> : null}

      <div className="section" style={{ marginTop: 22 }}>
        <div className="section-title">Disparos</div>
        <div className="automation-list">
          {visible.map((op) => {
            const sent = op.contacts.filter((x) => x.status === "sent").length;
            const queued = op.contacts.filter((x) => x.status === "queued").length;
            const failed = op.contacts.filter((x) => x.status === "failed").length;
            const processing = op.contacts.filter((x) => x.status === "processing").length;
            const paused = op.contacts.filter((x) => x.status === "paused").length;
            const expanded = openId === op.id;
            const busy = busyId === op.id;
            return (
              <div className="card" key={`${op.type}:${op.id}`} style={{ marginBottom: 12 }}>
                <div className="row" style={{ gap: 16, alignItems: "flex-start" }}>
                  <button type="button" onClick={() => setOpenId(expanded ? null : op.id)} style={{ all: "unset", cursor: "pointer", flex: 1 }}>
                    <div className="row" style={{ justifyContent: "flex-start", gap: 8 }}>
                      <span className={`badge ${op.type === "group" ? "ok" : ""}`}>{op.type === "group" ? "Grupo" : "Privado"}</span>
                      <span className={`badge ${op.active ? "ok" : "warn"}`}>{op.active ? "Ativo" : "Pausado"}</span>
                    </div>
                    <div className="instance-name" style={{ marginTop: 10 }}>{op.title}</div>
                    <div className="muted" style={{ marginTop: 4 }}>{op.subtitle || "—"}</div>
                    <div className="muted" style={{ marginTop: 8 }}>Campanhas: {op.campaigns.length ? op.campaigns.map((x) => x.name).join(" → ") : "nenhuma"}</div>
                    <div className="muted" style={{ marginTop: 4 }}>Contas: {op.senders.length ? op.senders.map((x) => `${x.name}${x.phone ? ` (+${x.phone})` : ""}`).join(" • ") : "nenhuma"}</div>
                  </button>

                  <div style={{ textAlign: "right", minWidth: 180 }}>
                    <div className="metric" style={{ fontSize: 24 }}>{op.contacts.length}</div>
                    <div className="muted">contatos</div>
                    <div className="toolbar" style={{ marginTop: 10, justifyContent: "flex-end" }}>
                      <button className="btn secondary" disabled={busy} onClick={() => toggleOperation(op)}>
                        {busy ? "Aguarde..." : op.active ? "Pausar" : "Continuar"}
                      </button>
                      <button className="btn danger-btn" disabled={busy} onClick={() => deleteOperation(op)}>Excluir</button>
                    </div>
                  </div>
                </div>

                <div className="toolbar" style={{ marginTop: 12 }}>
                  <span className="badge ok">{sent} enviados</span>
                  <span className="badge warn">{queued} aguardando</span>
                  {processing ? <span className="badge">{processing} processando</span> : null}
                  {paused ? <span className="badge warn">{paused} pausados</span> : null}
                  {failed ? <span className="badge bad">{failed} erros</span> : null}
                </div>

                {expanded ? (
                  <div style={{ marginTop: 18, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                    <div className="section-title" style={{ fontSize: 16 }}>Contas disparadoras</div>
                    <div className="selector-grid" style={{ marginTop: 10 }}>
                      {op.senders.map((sender) => (
                        <div className="selector-card selected" key={sender.id}>
                          <span><strong>{sender.name}</strong><small>{sender.phone ? `+${sender.phone} • ` : ""}{sender.status === "connected" ? "online" : sender.status}</small></span>
                        </div>
                      ))}
                      {!op.senders.length ? <div className="muted">Nenhuma conta vinculada.</div> : null}
                    </div>

                    <div className="section-title" style={{ fontSize: 16, marginTop: 18 }}>Fila e histórico desta operação</div>
                    <div className="muted" style={{ marginTop: 4 }}>Todos os contatos, campanhas, contas e resultados ficam centralizados aqui.</div>
                    <div className="table-wrap" style={{ marginTop: 10, maxHeight: 500, overflowY: "auto" }}>
                      <table>
                        <thead><tr><th>Número</th><th>Campanha</th><th>Conta</th><th>Status</th><th>Horário</th><th>Detalhe</th></tr></thead>
                        <tbody>
                          {op.contacts.map((row) => (
                            <tr key={row.id}>
                              <td>{row.phone ? `+${row.phone}` : "—"}</td>
                              <td>{row.campaign_name || "—"}</td>
                              <td>{row.sender_name || "—"}</td>
                              <td><span className={`badge ${badgeClass(row.status)}`}>{statusLabel(row.status)}</span></td>
                              <td>{fmt(row.processed_at || row.scheduled_at)}</td>
                              <td className="muted">{row.detail || (row.status === "sent" ? "Concluído" : "—")}</td>
                            </tr>
                          ))}
                          {!op.contacts.length ? <tr><td colSpan={6}>Nenhum contato entrou nesta operação ainda.</td></tr> : null}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
          {!visible.length ? <div className="card empty-state">Nenhum disparo criado ainda.</div> : null}
        </div>
      </div>
    </>
  );
}
