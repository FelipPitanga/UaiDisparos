"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function LiveRefresh({ intervalMs = 1000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => {
      if (document.hidden) return;
      router.refresh();
      setLastRefresh(new Date());
    };

    tick();
    const timer = window.setInterval(tick, intervalMs);
    const onVisibility = () => {
      if (!document.hidden) tick();
    };
    const onFocus = () => tick();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, [intervalMs, router]);

  return (
    <span className="badge ok" title={lastRefresh ? `Última atualização: ${lastRefresh.toLocaleTimeString("pt-BR")}` : "Atualizando..."}>
      ● Ao vivo • {intervalMs < 1000 ? `${intervalMs}ms` : `${(intervalMs / 1000).toFixed(intervalMs % 1000 ? 1 : 0)}s`}
    </span>
  );
}
