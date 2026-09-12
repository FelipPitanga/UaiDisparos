"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Smartphone,
  Users,
  UserRound,
  Megaphone,
  Send,
  MessageCircle,
  Activity,
  Bell,
} from "lucide-react";

const nav = [
  ["/", "Visão geral", LayoutDashboard],
  ["/instancias", "Instâncias", Smartphone],
  ["/grupos", "Grupos", Users],
  ["/leads", "Leads", UserRound],
  ["/campanhas", "Campanhas", Megaphone],
  ["/disparos", "Disparo em grupo", Send],
  ["/disparos/privado", "Disparo privado", MessageCircle],
  ["/operacoes", "Operações", Activity],
  ["/notificacoes", "Notificações", Bell],
] as const;

export default function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="nav">
      {nav.map(([href, label, Icon]) => {
        const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link key={href} href={href} className={active ? "active" : ""}>
            <span className="nav-icon"><Icon size={17} strokeWidth={1.8} /></span>
            <span>{label}</span>
            {active ? <span className="nav-active-dot" /> : null}
          </Link>
        );
      })}
    </nav>
  );
}
