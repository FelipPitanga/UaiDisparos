const groups = [
  ["Comunidade Lançamento 01","120363000001@g.us","842","Ativo"],
  ["Oferta 02","120363000002@g.us","396","Ativo"],
  ["VIP Setembro","120363000003@g.us","211","Pausado"],
];
export default function Page(){
  return <>
    <div className="topbar"><div><h1>Grupos</h1><div className="subtitle">Escolha quais grupos serão monitorados.</div></div><div className="toolbar"><button className="btn secondary">Sincronizar</button></div></div>
    <div className="table-wrap"><table>
      <thead><tr><th></th><th>Grupo</th><th>ID</th><th>Participantes</th><th>Monitoramento</th></tr></thead>
      <tbody>{groups.map((g,i)=><tr key={g[1]}><td><input type="checkbox" defaultChecked={i<2}/></td><td>{g[0]}</td><td>{g[1]}</td><td>{g[2]}</td><td><span className={"badge "+(i<2?"ok":"warn")}>{g[3]}</span></td></tr>)}</tbody>
    </table></div>
  </>
}
