export default function Page(){
  return <>
    <div className="topbar"><div><h1>Instâncias</h1><div className="subtitle">Conexões de WhatsApp e providers.</div></div><button className="btn">+ Nova instância</button></div>
    <div className="table-wrap"><table>
      <thead><tr><th>Nome</th><th>Provider</th><th>Status</th><th>Grupos</th><th>Último evento</th></tr></thead>
      <tbody>
        <tr><td>Operação 01</td><td>UAZAPI</td><td><span className="badge ok">conectada</span></td><td>11</td><td>agora</td></tr>
        <tr><td>Operação 02</td><td>UAZAPI</td><td><span className="badge ok">conectada</span></td><td>7</td><td>3 min</td></tr>
      </tbody>
    </table></div>
    <div className="section card">
      <div className="section-title">Cadastrar instância</div>
      <div className="form-grid">
        <div className="field"><label>Nome</label><input className="input" placeholder="Ex.: Aparelho 01"/></div>
        <div className="field"><label>Provider</label><select className="select"><option>UAZAPI</option><option>Evolution</option></select></div>
        <div className="field"><label>Base URL</label><input className="input" placeholder="https://..."/></div>
        <div className="field"><label>Token</label><input className="input" type="password" placeholder="••••••••••"/></div>
      </div>
      <div style={{marginTop:14}}><button className="btn">Salvar instância</button></div>
    </div>
  </>
}
