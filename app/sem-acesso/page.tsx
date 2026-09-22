import Link from "next/link";

export default function SemAcessoPage() {
  return (
    <div className="card" style={{ maxWidth: 680, margin: "60px auto", padding: 32 }}>
      <div className="eyebrow">ACESSO DA CONTA</div>
      <h1 style={{ marginTop: 8 }}>Este módulo está bloqueado</h1>
      <p className="muted">O administrador da UAI pode liberar ou bloquear cada módulo individualmente para sua conta.</p>
      <Link href="/" className="btn primary" style={{ display: "inline-flex", marginTop: 16 }}>Voltar para a visão geral</Link>
    </div>
  );
}
