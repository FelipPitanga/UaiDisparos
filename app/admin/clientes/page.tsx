import AccountsManager from "./AccountsManager";
import TeamManager from "./TeamManager";

export const dynamic = "force-dynamic";

export default function AdminClientesPage() {
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">ADMINISTRAÇÃO</div>
          <h1>Clientes & acessos</h1>
          <p className="muted">Controle clientes, colaboradores, módulos e quantidade de instâncias de cada operação.</p>
        </div>
      </div>
      <AccountsManager />
      <TeamManager />
    </>
  );
}
