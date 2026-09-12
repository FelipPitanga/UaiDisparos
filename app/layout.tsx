import "./globals.css";
import SidebarNav from "./components/SidebarNav";

export const metadata = {
  title: "UAI Disparos",
  description: "Disparo certo. Escala real.",
};

function BrandMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="brand-mark-svg">
      <defs>
        <linearGradient id="uai-gold" x1="6" y1="5" x2="41" y2="42" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F5CC78" />
          <stop offset=".54" stopColor="#E7B34E" />
          <stop offset="1" stopColor="#C46A3F" />
        </linearGradient>
      </defs>
      <path d="M7 15.8 41.5 5.9 27.8 41 21.5 27.2 7 15.8Z" fill="url(#uai-gold)" />
      <path d="m14.5 17.1 20.7-6.3-14.7 12.9-6-6.6Z" fill="#F7F4ED" fillOpacity=".9" />
      <path d="m21.2 26 12.5-10.9-8.4 20.3-4.1-9.4Z" fill="#2E5D3A" />
      <path d="m7.2 30.5 10.5-3.8 4.1 8.8-5.6 6.6-9-11.6Z" fill="#E7B34E" />
    </svg>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <div className="brand-ambient" aria-hidden="true" />
        <div className="shell">
          <aside className="sidebar">
            <div className="brand-lockup">
              <span className="brand-mark"><BrandMark /></span>
              <div className="brand-wordmark">
                <strong>UAI</strong>
                <span>DISPAROS</span>
              </div>
            </div>
            <div className="brand-tagline">Disparo certo. Escala real.</div>
            <div className="sidebar-divider" />
            <SidebarNav />
            <div className="sidebar-footer">
              <div className="cerrado-seal">CENTRO-OESTE • BRASIL</div>
              <div className="sidebar-footer-copy">Tecnologia com alma do Cerrado.</div>
            </div>
          </aside>
          <main className="content">
            <div className="content-inner">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
