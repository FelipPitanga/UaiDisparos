"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function LiveRefresh({ intervalMs = 2000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  useEffect(() => {
    let running = false;

    const tick = async () => {
      if (running || document.hidden) return;
      running = true;
      try {
        router.refresh();
        setLastRefresh(new Date());
      } finally {
        running = false;
      }
    };

    tick();
    const timer = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs, router]);

  return (
    <span className="badge ok" title={lastRefresh ? `Última atualização: ${lastRefresh.toLocaleTimeString("pt-BR")}` : "Atualizando..."}>
      ● Ao vivo • {Math.round(intervalMs / 1000)}s
    </span>
  );
}
