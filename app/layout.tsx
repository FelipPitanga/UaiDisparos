import "./globals.css";
import "./brand-overrides.css";
import AppShell from "./components/AppShell";

export const metadata = {
  title: "UAI Disparos",
  description: "Disparo certo. Escala real.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="pt-BR"><body><AppShell>{children}</AppShell></body></html>;
}
