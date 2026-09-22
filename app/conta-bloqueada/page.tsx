import Link from "next/link";

export default function ContaBloqueadaPage() {
  return (
    <div className="card" style={{ maxWidth: 680, margin: "60px auto", padding: 32 }}>
      <div className="eyebrow">STATUS DA CONTA</div>
      <h1 style={{ marginTop: 8 }}>Conta indisponível</h1>
      <p className="muted">Sua conta está suspensa ou ainda não possui um perfil válido. Fale com o administrador para regularizar o acesso.</p>
      <Link href="/login" className="btn" style={{ display: "inline-flex", marginTop: 16 }}>Voltar ao login</Link>
    </div>
  );
}
