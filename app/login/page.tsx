"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

const panel: React.CSSProperties = {
  width: "min(440px, calc(100vw - 32px))",
  padding: 32,
  borderRadius: 24,
  border: "1px solid rgba(231,179,78,.22)",
  background: "rgba(11,31,20,.94)",
  boxShadow: "0 30px 90px rgba(0,0,0,.34)",
};
const input: React.CSSProperties = {
  width: "100%", minHeight: 48, borderRadius: 12,
  border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.05)",
  color: "#fff", padding: "0 14px", outline: "none",
};

export default function LoginPage() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    const { error: authError } = await getSupabaseBrowser().auth.signInWithPassword({ email, password });
    if (authError) {
      setError(authError.message === "Invalid login credentials" ? "E-mail ou senha inválidos." : authError.message);
      setBusy(false); return;
    }
    window.location.href = params.get("next") || "/";
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16, background: "radial-gradient(circle at 20% 10%, rgba(231,179,78,.12), transparent 30%), #06140c" }}>
      <form onSubmit={submit} style={panel}>
        <div style={{ color: "#e7b34e", fontSize: 13, fontWeight: 800, letterSpacing: ".14em" }}>UAI DISPAROS</div>
        <h1 style={{ margin: "10px 0 6px", fontSize: 30 }}>Entrar na sua conta</h1>
        <p style={{ margin: "0 0 24px", color: "rgba(255,255,255,.58)", fontSize: 14 }}>Acesse sua operação, instâncias e disparos.</p>
        <label style={{ display: "grid", gap: 7, marginBottom: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>E-mail</span>
          <input style={input} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com" />
        </label>
        <label style={{ display: "grid", gap: 7, marginBottom: 18 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Senha</span>
          <input style={input} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Sua senha" />
        </label>
        {error ? <div style={{ marginBottom: 14, color: "#ff8f8f", fontSize: 13 }}>{error}</div> : null}
        <button type="submit" disabled={busy} style={{ width: "100%", minHeight: 48, border: 0, borderRadius: 12, background: "#e7b34e", color: "#102015", fontWeight: 900, cursor: "pointer" }}>
          {busy ? "Entrando..." : "Entrar"}
        </button>
        <p style={{ textAlign: "center", color: "rgba(255,255,255,.58)", fontSize: 13, marginTop: 20 }}>
          Ainda não tem conta? <Link href="/cadastro" style={{ color: "#e7b34e", fontWeight: 800 }}>Criar cadastro</Link>
        </p>
      </form>
    </div>
  );
}
