import { Smartphone, Users, UserRound, Megaphone, Send, TriangleAlert } from "lucide-react";

const metrics = [
  ["Instâncias conectadas", "2", Smartphone],
  ["Grupos monitorados", "18", Users],
  ["Leads capturados", "1.284", UserRound],
  ["Campanhas ativas", "3", Megaphone],
  ["Processados hoje", "146", Send],
  ["Erros hoje", "4", TriangleAlert],
];

export default function Page() {
  return <>
    <div className="topbar">
      <div>
        <h1>Dashboard</h1>
        <div className="subtitle">Visão geral da operação do UaiDisparos.</div>
      </div>
      <span className="badge ok">● Operação ativa</span>
    </div>

    <div className="grid">
      {metrics.map(([label, value, Icon]: any) => (
        <div className="card" key={label}>
          <div className="row"><div className="label">{label}</div><div className="kpi-icon"><Icon size={18}/></div></div>
          <div className="metric">{value}</div>
        </div>
      ))}
    </div>

    <div className="section">
      <div className="section-title">Atividade recente</div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Evento</th><th>Origem</th><th>Status</th><th>Horário</th></tr></thead>
          <tbody>
            <tr><td>Novo participante detectado</td><td>Grupo Oferta 01</td><td><span className="badge ok">processado</span></td><td>agora</td></tr>
            <tr><td>Webhook recebido</td><td>UAZAPI / Instância 01</td><td><span className="badge ok">200</span></td><td>2 min</td></tr>
            <tr><td>Lead sem telefone normalizado</td><td>Grupo Comunidade 03</td><td><span className="badge warn">revisar LID</span></td><td>6 min</td></tr>
            <tr><td>Job falhou</td><td>Fila de processamento</td><td><span className="badge bad">failed</span></td><td>12 min</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </>;
}
