"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SyncButton() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function syncGroups() {
    try {
      setLoading(true);
      setMessage("");
      const response = await fetch("/api/uazapi/sync-groups", { method: "POST" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Falha ao sincronizar grupos.");
      setMessage(`${data.synced} grupo(s) sincronizado(s)`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao sincronizar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="toolbar">
      {message ? <span className="subtitle">{message}</span> : null}
      <button className="btn secondary" onClick={syncGroups} disabled={loading}>
        {loading ? "Sincronizando..." : "Sincronizar"}
      </button>
    </div>
  );
}
