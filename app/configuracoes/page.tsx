export default function Page(){
  return <>
    <div className="topbar"><div><h1>Configurações</h1><div className="subtitle">Limites operacionais, horários e segurança.</div></div></div>
    <div className="card">
      <div className="form-grid">
        <div className="field"><label>Limite diário por instância</label><input className="input" type="number" defaultValue="40"/></div>
        <div className="field"><label>Máx. tentativas por job</label><input className="input" type="number" defaultValue="3"/></div>
        <div className="field"><label>Início do horário permitido</label><input className="input" type="time" defaultValue="08:00"/></div>
        <div className="field"><label>Fim do horário permitido</label><input className="input" type="time" defaultValue="20:00"/></div>
      </div>
      <div style={{marginTop:16}} className="row"><div><strong>Pausa global</strong><div className="muted">Interrompe novos processamentos da fila.</div></div><button className="btn secondary">Pausar operação</button></div>
    </div>
  </>
}
