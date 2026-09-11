"use client";

import { useState } from "react";

export default function MonitorToggle({ id, initialEnabled }: { id: string; initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    const next = !enabled;
    setLoading(true);
    try {
      const response = await fetch("/api/groups/monitoring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, enabled: next }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Falha ao atualizar monitoramento");
      setEnabled(next);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Erro ao atualizar monitoramento");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      className={`btn ${enabled ? "" : "secondary"}`}
      onClick={toggle}
      disabled={loading}
      style={{ minWidth: 110 }}
    >
      {loading ? "Salvando..." : enabled ? "Monitorando" : "Pausado"}
    </button>
  );
}
