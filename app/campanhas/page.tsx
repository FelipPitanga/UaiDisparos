export default function Page(){
  return <>
    <div className="topbar"><div><h1>Campanhas</h1><div className="subtitle">Modelos de mensagens e regras de processamento.</div></div><button className="btn">+ Nova campanha</button></div>
    <div className="card">
      <div className="section-title">Nova campanha</div>
      <div className="form-grid">
        <div className="field"><label>Nome</label><input className="input" placeholder="Campanha Setembro"/></div>
        <div className="field"><label>Grupo de origem</label><select className="select"><option>Selecione...</option><option>Oferta 02</option></select></div>
      </div>
      <div className="field" style={{marginTop:14}}><label>Texto</label><textarea className="textarea" rows={5} placeholder="Escreva a mensagem..."/></div>
      <div className="form-grid" style={{marginTop:14}}>
        <div className="field"><label>Imagem</label><input className="input" type="url" placeholder="https://..."/></div>
        <div className="field"><label>CTA 1</label><input className="input" placeholder="Ver oferta"/></div>
        <div className="field"><label>CTA 2</label><input className="input" placeholder="Saiba mais"/></div>
        <div className="field"><label>CTA 3</label><input className="input" placeholder="Sair"/></div>
      </div>
      <p className="muted" style={{fontSize:13}}>Envio automático fica condicionado a consentimento registrado, regras de horário e lista de supressão.</p>
      <button className="btn">Salvar modelo</button>
    </div>
  </>
}
