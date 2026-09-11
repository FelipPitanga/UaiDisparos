const leads = [
  ["#1284","5562999990001","5562999990001@s.whatsapp.net","Oferta 02","opt-in","normalizado"],
  ["#1283","—","123456789012345@lid","VIP Setembro","pendente","LID"],
  ["#1282","5562988880002","5562988880002@s.whatsapp.net","Comunidade 01","opt-in","normalizado"],
];
export default function Page(){
  return <>
    <div className="topbar"><div><h1>Leads</h1><div className="subtitle">Participantes capturados pelos eventos monitorados.</div></div><button className="btn secondary">Exportar</button></div>
    <div className="table-wrap"><table>
      <thead><tr><th>ID</th><th>Telefone</th><th>Identificador</th><th>Origem</th><th>Consentimento</th><th>Identidade</th></tr></thead>
      <tbody>{leads.map(l=><tr key={l[0]}>{l.map((x,i)=><td key={i}>{i===4?<span className={"badge "+(x==="opt-in"?"ok":"warn")}>{x}</span>:x}</td>)}</tr>)}</tbody>
    </table></div>
  </>
}
