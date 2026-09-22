"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type PermissionKey =
  | "overview" | "instances" | "groups" | "leads" | "campaigns"
  | "group_broadcast" | "private_broadcast" | "operations" | "notifications" | "settings";

type Account = {
  id: string;
  name: string;
  status: string;
  is_primary: boolean;
  permissions: Record<string, boolean>;
};

type Member = {
  user_id: string;
  account_id: string;
  name: string | null;
  email: string | null;
  role: string;
  permissions: Record<string, boolean> | null;
  created_at: string;
};

const permissionLabels: [PermissionKey, string][] = [
  ["overview", "Visão geral"],
  ["instances", "Instâncias / conexões"],
  ["groups", "Grupos"],
  ["leads", "Leads"],
  ["campaigns", "Campanhas"],
  ["group_broadcast", "Disparo em grupo"],
  ["private_broadcast", "Disparo privado"],
  ["operations", "Operações / logs"],
  ["notifications", "Notificações"],
  ["settings", "Configurações"],
];

const off = () => Object.fromEntries(permissionLabels.map(([key]) => [key, false])) as Record<PermissionKey, boolean>;
const connectorPreset = () => ({ ...off(), overview: true, instances: true });
const fullPreset = () => Object.fromEntries(permissionLabels.map(([key]) => [key, true])) as Record<PermissionKey, boolean>;

export default function TeamManager() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [accountId, setAccountId] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    permissions: connectorPreset(),
  });

  async function load(nextAccountId?: string) {
    const query = nextAccountId ? `?account_id=${encodeURIComponent(nextAccountId)}` : "";
    const response = await fetch(`/api/admin/team${query}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok || !body?.ok) throw new Error(body?.error || "Erro ao carregar usuários.");

    setAccounts(body.accounts || []);
    setMembers(body.members || []);
    setAccountId(body.selected_account_id || "");
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Erro ao carregar usuários."));
  }, []);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === accountId) || null,
    [accounts, accountId],
  );

  async function createMember(event: FormEvent) {
    event.preventDefault();
    setBusy("new");
    setError("");

    try {
      const response = await fetch("/api/admin/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, account_id: accountId }),
      });
      const body = await response.json();
      if (!response.ok || !body?.ok) throw new Error(body?.error || "Erro ao criar colaboradora.");

      setMembers(body.members || []);
      setForm({ name: "", email: "", password: "", permissions: connectorPreset() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar colaboradora.");
    } finally {
      setBusy("");
    }
  }

  function patchMember(userId: string, patch: Partial<Member>) {
    setMembers((current) => current.map((member) => member.user_id === userId ? { ...member, ...patch } : member));
  }

  async function saveMember(member: Member) {
    setBusy(member.user_id);
    setError("");

    try {
      const response = await fetch(`/api/admin/team/${member.user_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: member.name, permissions: member.permissions || off() }),
      });
      const body = await response.json();
      if (!response.ok || !body?.ok) throw new Error(body?.error || "Erro ao salvar colaboradora.");
      patchMember(member.user_id, body.member);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar colaboradora.");
    } finally {
      setBusy("");
    }
  }

  async function deleteMember(member: Member) {
    const label = member.name || member.email || "este usuário";
    const confirmed = window.confirm(
      `Excluir "${label}"?\n\nEsse acesso será removido definitivamente e a pessoa não conseguirá mais entrar no sistema.`,
    );
    if (!confirmed) return;

    setBusy(`delete:${member.user_id}`);
    setError("");

    try {
      const response = await fetch(`/api/admin/team/${member.user_id}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok || !body?.ok) throw new Error(body?.error || "Erro ao excluir usuário.");

      setMembers((current) => current.filter((item) => item.user_id !== member.user_id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir usuário.");
    } finally {
      setBusy("");
    }
  }

  async function switchAccount(value: string) {
    setAccountId(value);
    setError("");
    try {
      await load(value);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao trocar operação.");
    }
  }

  return (
    <section className="card" style={{ padding: 20, marginTop: 18 }}>
      <div className="row" style={{ justifyContent: "space-between", gap: 16, alignItems: "flex-end" }}>
        <div>
          <div className="eyebrow">EQUIPE DA OPERAÇÃO</div>
          <h2 style={{ margin: "4px 0 6px" }}>Usuários e colaboradores</h2>
          <p className="muted" style={{ margin: 0 }}>
            Cada pessoa usa a mesma operação, mas enxerga somente os módulos liberados para o próprio usuário.
          </p>
        </div>

        <label style={{ display: "grid", gap: 6, minWidth: 240 }}>
          <span className="muted" style={{ fontSize: 11 }}>Operação</span>
          <select className="input" value={accountId} onChange={(e) => switchAccount(e.target.value)}>
            {accounts.map((account) => (
              <option value={account.id} key={account.id}>
                {account.name}{account.is_primary ? " • Principal" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <div className="card" style={{ padding: 12, marginTop: 14, borderColor: "rgba(255,90,90,.35)", color: "#ff9b9b" }}>
          {error}
        </div>
      ) : null}

      <form onSubmit={createMember} style={{ marginTop: 18, paddingTop: 18, borderTop: "1px solid rgba(255,255,255,.08)" }}>
        <div className="row" style={{ justifyContent: "space-between", gap: 14 }}>
          <div>
            <div className="eyebrow">NOVA COLABORADORA</div>
            <h3 style={{ margin: "4px 0" }}>{selectedAccount?.name || "Operação"}</h3>
            <p className="muted" style={{ margin: 0 }}>
              O padrão abaixo libera somente Visão geral + Instâncias. As conexões criadas entram na mesma operação e ficam disponíveis para o administrador.
            </p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 10, marginTop: 14 }}>
          <input className="input" required placeholder="Nome" value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} />
          <input className="input" type="email" required placeholder="E-mail" value={form.email} onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))} />
          <input className="input" type="password" minLength={8} required placeholder="Senha inicial" value={form.password} onChange={(e) => setForm((current) => ({ ...current, password: e.target.value }))} />
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          <button type="button" className="btn secondary" onClick={() => setForm((current) => ({ ...current, permissions: connectorPreset() }))}>
            Só conexões
          </button>
          <button type="button" className="btn secondary" onClick={() => setForm((current) => ({ ...current, permissions: fullPreset() }))}>
            Acesso completo
          </button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          {permissionLabels.map(([key, label]) => (
            <label key={key} className="badge" style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <input
                type="checkbox"
                checked={form.permissions[key] === true}
                onChange={(e) => setForm((current) => ({
                  ...current,
                  permissions: { ...current.permissions, [key]: e.target.checked },
                }))}
              />
              {label}
            </label>
          ))}
        </div>

        <button className="btn primary" type="submit" disabled={busy === "new" || !accountId} style={{ marginTop: 14 }}>
          {busy === "new" ? "Criando..." : "Criar colaboradora"}
        </button>
      </form>

      <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
        {members.map((member) => {
          const isSuperAdmin = member.role === "super_admin";
          const permissions = member.permissions || selectedAccount?.permissions || off();

          return (
            <div className="card" style={{ padding: 16 }} key={member.user_id}>
              <div className="row" style={{ justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div className="row" style={{ gap: 8 }}>
                    <strong>{member.name || member.email || "Usuário"}</strong>
                    {isSuperAdmin ? <span className="badge ok">Super admin</span> : <span className="badge">Colaborador</span>}
                  </div>
                  <div className="muted" style={{ marginTop: 4 }}>{member.email}</div>
                </div>

                {!isSuperAdmin ? (
                  <div className="row" style={{ gap: 8 }}>
                    <button
                      className="btn danger-btn"
                      disabled={busy === member.user_id || busy === `delete:${member.user_id}`}
                      onClick={() => deleteMember(member)}
                    >
                      {busy === `delete:${member.user_id}` ? "Excluindo..." : "Excluir usuário"}
                    </button>
                    <button
                      className="btn primary"
                      disabled={busy === member.user_id || busy === `delete:${member.user_id}`}
                      onClick={() => saveMember({ ...member, permissions })}
                    >
                      {busy === member.user_id ? "Salvando..." : "Salvar acesso"}
                    </button>
                  </div>
                ) : null}
              </div>

              {!isSuperAdmin ? (
                <>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                    <button type="button" className="btn secondary" onClick={() => patchMember(member.user_id, { permissions: connectorPreset() })}>
                      Visão geral + conexões
                    </button>
                    <button type="button" className="btn secondary" onClick={() => patchMember(member.user_id, { permissions: fullPreset() })}>
                      Completo
                    </button>
                    <button type="button" className="btn secondary" onClick={() => patchMember(member.user_id, { permissions: off() })}>
                      Bloquear módulos
                    </button>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                    {permissionLabels.map(([key, label]) => (
                      <label key={key} className="badge" style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <input
                          type="checkbox"
                          checked={permissions[key] === true}
                          onChange={(e) => patchMember(member.user_id, { permissions: { ...permissions, [key]: e.target.checked } })}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </>
              ) : (
                <p className="muted" style={{ margin: "12px 0 0" }}>
                  O super administrador sempre possui acesso total à operação.
                </p>
              )}
            </div>
          );
        })}

        {!members.length ? <div className="muted">Nenhum usuário nesta operação.</div> : null}
      </div>
    </section>
  );
}
