"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type InstanceHealth = {
  id: string;
  name: string;
  phone: string | null;
  status: string;
  instance_role: "monitor" | "sender";
  send_blocked_until: string | null;
  send_block_reason: string | null;
  send_block_code: string | null;
  last_seen_at: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(value));
  } catch {
    return "—";
  }
}

export default function InstanceHealthPanel({ instances }: { instances: InstanceHealth[] }) {
  const router = useRouter();

  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), 10000);
    return () => window.clearInterval(timer);
  }, [router]);

  const senders = instances.filter((item) => item.instance_role === "sender");

  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <div className="row" style={{ marginBottom: 12 }}>
        <div>
          <div className="section-title">Verificador contínuo</div>
          <div className="muted">A nuvem consulta conexão e restrições dos disparadores a cada 30 segundos. Esta tela atualiza a cada 10 segundos.</div>
        </div>
        <span className="badge ok">● Ativo na nuvem</span>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {senders.map((item) => {
          const restricted = Boolean(item.send_blocked_until && Date.parse(item.send_blocked_until) > Date.now());
          const online = item.status === "connected";
          return (
            <div key={item.id} className="card" style={{ padding: 12 }}>
              <div className="row">
                <div>
                  <div className="instance-name">{item.name}</div>
                  <div className="muted">{item.phone ? `+${item.phone}` : "Sem número"} • última checagem {formatDate(item.last_seen_at)}</div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <span className={`badge ${online ? "ok" : "bad"}`}>{online ? "Conectado" : "Desconectado"}</span>
                  <span className={`badge ${restricted ? "warn" : online ? "ok" : ""}`}>{restricted ? "Restrição de novas conversas" : online ? "Envio liberado" : "Sem checagem de envio"}</span>
                </div>
              </div>

              {restricted ? (
                <div className="alert-error compact" style={{ marginTop: 10 }}>
                  {item.send_block_reason || "WhatsApp restringiu temporariamente novas conversas."}
                  {item.send_blocked_until ? ` Liberação informada: ${formatDate(item.send_blocked_until)}.` : ""}
                  {item.send_block_code ? ` Código: ${item.send_block_code}.` : ""}
                </div>
              ) : null}
            </div>
          );
        })}

        {!senders.length ? <div className="muted">Nenhum disparador cadastrado.</div> : null}
      </div>
    </div>
  );
}
