export default function Page(){
  return <>
    <div className="topbar"><div><h1>Logs</h1><div className="subtitle">Eventos, payloads e erros de processamento.</div></div><button className="btn secondary">Atualizar</button></div>
    <div className="table-wrap"><table>
      <thead><tr><th>Tipo</th><th>Instância</th><th>Status</th><th>Recebido em</th><th>Detalhe</th></tr></thead>
      <tbody>
        <tr><td>group.participant</td><td>Operação 01</td><td><span className="badge ok">processado</span></td><td>10:31:22</td><td>participant:add</td></tr>
        <tr><td>webhook</td><td>Operação 01</td><td><span className="badge ok">200</span></td><td>10:31:21</td><td>payload salvo</td></tr>
        <tr><td>identity</td><td>Operação 02</td><td><span className="badge warn">pendente</span></td><td>10:28:03</td><td>@lid sem telefone</td></tr>
      </tbody>
    </table></div>
  </>
}
