import AccountsManager from "./AccountsManager";

export const dynamic = "force-dynamic";

export default function AdminClientesPage() {
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">ADMINISTRAÇÃO</div>
          <h1>Clientes & acessos</h1>
          <p className="muted">Controle módulos, bloqueio da conta e quantidade de instâncias de cada cliente.</p>
        </div>
      </div>
      <AccountsManager />
    </>
  );
}
