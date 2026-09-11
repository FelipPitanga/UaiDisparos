"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function AutoRefresh({ intervalMs = 10000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => {
      if (document.hidden) return;
      router.refresh();
      setLastRefresh(new Date());
    };

    const timer = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs, router]);

  return (
    <span className="badge ok" title={lastRefresh ? `Tela atualizada às ${lastRefresh.toLocaleTimeString("pt-BR")}` : "Sincronização automática ativa"}>
      ● Auto sync • {Math.round(intervalMs / 1000)}s
    </span>
  );
}
