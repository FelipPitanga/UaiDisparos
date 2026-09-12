import "./globals.css";
import Link from "next/link";
import { Activity, LayoutDashboard, Smartphone, Users, UserRound, Megaphone, Send, MessageCircle, Bell, RadioTower } from "lucide-react";

export const metadata = {
  title: "UaiDisparos",
  description: "Gestão simples de grupos, leads, campanhas e disparos"
};

const nav = [
  ["/", "Dashboard", LayoutDashboard],
  ["/operacoes", "Operações", RadioTower],
  ["/instancias", "Instâncias", Smartphone],
  ["/grupos", "Grupos", Users],
  ["/leads", "Leads", UserRound],
  ["/campanhas", "Campanhas", Megaphone],
  ["/disparos", "Disparo em grupo", Send],
  ["/disparos/privado", "Disparo privado", MessageCircle],
  ["/notificacoes", "Notificações", Bell],
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <div className="shell">
          <aside className="sidebar">
            <div className="logo">
              <span className="logo-badge"><Activity size={20}/></span>
              <span>UaiDisparos</span>
            </div>
            <nav className="nav">
              {nav.map(([href, label, Icon]: any) => (
                <Link key={href} href={href}><Icon size={17} style={{verticalAlign:"middle",marginRight:8}} />{label}</Link>
              ))}
            </nav>
          </aside>
          <main className="content">{children}</main>
        </div>
      </body>
    </html>
  );
}
