"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

const panel: React.CSSProperties = {
  width: "min(460px, calc(100vw - 32px))",
  padding: 32, borderRadius: 24,
  border: "1px solid rgba(231,179,78,.22)",
  background: "rgba(11,31,20,.94)",
  boxShadow: "0 30px 90px rgba(0,0,0,.34)",
};
const input: React.CSSProperties = {
  width: "100%", minHeight: 48, borderRadius: 12,
  border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.05)",
  color: "#fff", padding: "0 14px", outline: "none",
};

export default function CadastroPage() {
  const [name,setName]=useState(""); const [email,setEmail]=useState("");
  const [password,setPassword]=useState(""); const [confirm,setConfirm]=useState("");
  const [busy,setBusy]=useState(false); const [error,setError]=useState(""); const [success,setSuccess]=useState("");

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setSuccess("");
    if (name.trim().length < 2) return setError("Informe seu nome.");
    if (password.length < 8) return setError("A senha precisa ter pelo menos 8 caracteres.");
    if (password !== confirm) return setError("As senhas não conferem.");
    setBusy(true);
    const { data, error: authError } = await getSupabaseBrowser().auth.signUp({
      email: email.trim().toLowerCase(), password, options: { data: { name: name.trim() } },
    });
    if (authError) { setError(authError.message); setBusy(false); return; }
    if (data.session) { window.location.href = "/"; return; }
    setSuccess("Cadastro criado. Confira seu e-mail para confirmar a conta e depois faça login.");
    setBusy(false);
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16, background: "radial-gradient(circle at 20% 10%, rgba(231,179,78,.12), transparent 30%), #06140c" }}>
      <form onSubmit={submit} style={panel}>
        <div style={{ color: "#e7b34e", fontSize: 13, fontWeight: 800, letterSpacing: ".14em" }}>UAI DISPAROS</div>
        <h1 style={{ margin: "10px 0 6px", fontSize: 30 }}>Criar sua conta</h1>
        <p style={{ margin: "0 0 24px", color: "rgba(255,255,255,.58)", fontSize: 14 }}>Nome, e-mail e senha. Depois o acesso fica controlado pelo painel administrativo.</p>
        <label style={{ display: "grid", gap: 7, marginBottom: 14 }}><span style={{ fontSize: 13, fontWeight: 700 }}>Nome</span><input style={input} required value={name} onChange={(e)=>setName(e.target.value)} placeholder="Seu nome ou empresa" /></label>
        <label style={{ display: "grid", gap: 7, marginBottom: 14 }}><span style={{ fontSize: 13, fontWeight: 700 }}>E-mail</span><input style={input} type="email" autoComplete="email" required value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="voce@empresa.com" /></label>
        <label style={{ display: "grid", gap: 7, marginBottom: 14 }}><span style={{ fontSize: 13, fontWeight: 700 }}>Senha</span><input style={input} type="password" minLength={8} autoComplete="new-password" required value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" /></label>
        <label style={{ display: "grid", gap: 7, marginBottom: 18 }}><span style={{ fontSize: 13, fontWeight: 700 }}>Confirmar senha</span><input style={input} type="password" minLength={8} autoComplete="new-password" required value={confirm} onChange={(e)=>setConfirm(e.target.value)} placeholder="Repita a senha" /></label>
        {error ? <div style={{ marginBottom: 14, color: "#ff8f8f", fontSize: 13 }}>{error}</div> : null}
        {success ? <div style={{ marginBottom: 14, color: "#8ee6a6", fontSize: 13 }}>{success}</div> : null}
        <button type="submit" disabled={busy} style={{ width: "100%", minHeight: 48, border: 0, borderRadius: 12, background: "#e7b34e", color: "#102015", fontWeight: 900, cursor: "pointer" }}>{busy ? "Criando..." : "Criar conta"}</button>
        <p style={{ textAlign: "center", color: "rgba(255,255,255,.58)", fontSize: 13, marginTop: 20 }}>Já tem conta? <Link href="/login" style={{ color: "#e7b34e", fontWeight: 800 }}>Entrar</Link></p>
      </form>
    </div>
  );
}
