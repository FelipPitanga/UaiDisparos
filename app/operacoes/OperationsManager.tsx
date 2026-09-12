"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Send, MoreVertical } from "lucide-react";

type Sender = { id: string; name: string; phone: string | null; status: string };
type Campaign = { id: string; name: string };
type Contact = { id:string; phone:string|null; status:string; campaign_name:string|null; sender_name:string|null; detail:string|null; processed_at:string|null; scheduled_at:string|null };
type Operation = { id:string; type:"group"|"private"; title:string; subtitle:string|null; active:boolean; campaigns:Campaign[]; senders:Sender[]; contacts:Contact[] };
type Props = { operations: Operation[] };

function statusLabel(status:string){ if(status==="sent")return"Enviado"; if(status==="failed")return"Falhou"; if(status==="processing")return"Em processamento"; if(status==="paused")return"Pausado"; if(status==="skipped")return"Ignorado"; return"Agendado"; }
function dotClass(status:string){ if(status==="sent")return"sent"; if(status==="failed"||status==="skipped")return"failed"; if(status==="processing")return"processing"; if(status==="paused")return"paused"; return"queued"; }
function fmt(value:string|null){ if(!value)return"—"; try{return new Intl.DateTimeFormat("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",timeZone:"America/Sao_Paulo"}).format(new Date(value));}catch{return value;} }

export default function OperationsManager({ operations }: Props){
  const router=useRouter();
  const [openId,setOpenId]=useState<string|null>(operations[0]?.id??null);
  const [busyId,setBusyId]=useState<string|null>(null);
  const [error,setError]=useState("");
  const visible=useMemo(()=>operations,[operations]);

  async function toggleOperation(op:Operation){
    setBusyId(op.id);setError("");
    try{
      const url=op.type==="private"?`/api/private-broadcasts/${op.id}`:`/api/automations/${op.id}`;
      const body=op.type==="private"?{status:op.active?"paused":"active"}:{active:!op.active};
      const response=await fetch(url,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const data=await response.json();
      if(!response.ok||!data?.ok)throw new Error(data?.error||"Falha ao atualizar operação.");
      router.refresh();
    }catch(err){setError(err instanceof Error?err.message:"Erro ao atualizar operação.");}finally{setBusyId(null);}
  }

  async function deleteOperation(op:Operation){
    if(!window.confirm(`Excluir o disparo \"${op.title}\"?`))return;
    setBusyId(op.id);setError("");
    try{
      const url=op.type==="private"?`/api/private-broadcasts/${op.id}`:`/api/automations/${op.id}`;
      const response=await fetch(url,{method:"DELETE"});
      const data=await response.json();
      if(!response.ok||!data?.ok)throw new Error(data?.error||"Falha ao excluir operação.");
      if(openId===op.id)setOpenId(null);
      router.refresh();
    }catch(err){setError(err instanceof Error?err.message:"Erro ao excluir operação.");}finally{setBusyId(null);}
  }

  return <>
    <div className="topbar"><div><h1>Operações</h1><div className="subtitle">Campanhas ativas, fila, desempenho e histórico em tempo real.</div></div><span className="status-chip"><span className="status-dot sent"/>Ao vivo</span></div>
    {error?<div className="alert-error">{error}</div>:null}

    <div className="automation-list" style={{marginTop:18}}>
      {visible.map(op=>{
        const sent=op.contacts.filter(x=>x.status==="sent").length;
        const queued=op.contacts.filter(x=>x.status==="queued").length;
        const failed=op.contacts.filter(x=>x.status==="failed").length;
        const total=Math.max(1,op.contacts.length);
        const progress=Math.round((sent/total)*100);
        const expanded=openId===op.id;
        const busy=busyId===op.id;
        return <div className="operation-card" key={`${op.type}:${op.id}`}>
          <div className="operation-card-head">
            <button type="button" onClick={()=>setOpenId(expanded?null:op.id)} style={{all:"unset",cursor:"pointer",flex:1}}>
              <div className="operation-title-wrap">
                <div className="operation-icon"><Send size={25}/></div>
                <div>
                  <div className="operation-title">{op.title}</div>
                  <div className="operation-subtitle">{op.type==="group"?"Automação de grupo":"Lista privada"} • {op.campaigns.map(c=>c.name).join(" → ")||"Sem campanha"}</div>
                </div>
              </div>
            </button>
            <div style={{display:"flex",alignItems:"center",gap:10}}><span className="operation-growth">↑ {progress}%</span><MoreVertical size={20} color="#9F998F"/></div>
          </div>

          <div className="operation-metrics">
            <div><div className="operation-number">{sent.toLocaleString("pt-BR")}</div><div className="operation-label">Enviados</div></div>
            <div><div className="operation-number">{queued.toLocaleString("pt-BR")}</div><div className="operation-label">Aguardando</div><div className="operation-submetric ok">{op.active?"operação ativa":"operação pausada"}</div></div>
            <div><div className="operation-number">{failed.toLocaleString("pt-BR")}</div><div className="operation-label">Falhas</div><div className="operation-submetric warn">{op.senders.length} conta(s)</div></div>
          </div>
          <div className="operation-progress"><span style={{width:`${progress}%`}}/></div>

          <div className="operation-actions">
            <button className="btn secondary" disabled={busy} onClick={()=>toggleOperation(op)}>{busy?"Aguarde...":op.active?"Pausar disparo":"Continuar disparo"}</button>
            <button className="btn danger-btn" disabled={busy} onClick={()=>deleteOperation(op)}>Excluir</button>
          </div>

          {expanded?<div style={{marginTop:20,borderTop:"1px solid #34322D",paddingTop:18}}>
            <div className="section-title">Contas disparadoras</div>
            <div className="selector-grid" style={{marginTop:10}}>{op.senders.map(sender=><div className="selector-card selected" key={sender.id}><span><strong>{sender.name}</strong><small>{sender.phone?`+${sender.phone} • `:""}{sender.status==="connected"?"online":sender.status}</small></span></div>)}</div>

            <div className="section-title" style={{marginTop:20}}>Fila e histórico desta campanha</div>
            <div className="table-wrap" style={{marginTop:10,maxHeight:500,overflowY:"auto"}}><table><thead><tr><th>Número</th><th>Campanha</th><th>Conta</th><th>Status</th><th>Horário</th><th>Detalhe</th></tr></thead><tbody>
              {op.contacts.map(row=><tr key={row.id}><td>{row.phone?`+${row.phone}`:"—"}</td><td>{row.campaign_name||"—"}</td><td>{row.sender_name||"—"}</td><td><span className="status-chip"><span className={`status-dot ${dotClass(row.status)}`}/>{statusLabel(row.status)}</span></td><td>{fmt(row.processed_at||row.scheduled_at)}</td><td className="muted">{row.detail||(row.status==="sent"?"Concluído":"—")}</td></tr>)}
              {!op.contacts.length?<tr><td colSpan={6}>Nenhum contato entrou nesta operação ainda.</td></tr>:null}
            </tbody></table></div>
          </div>:null}
        </div>;
      })}
      {!visible.length?<div className="card empty-state">Nenhum disparo criado ainda.</div>:null}
    </div>
  </>;
}
