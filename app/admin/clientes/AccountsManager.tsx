"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type PermissionKey =
  | "overview" | "instances" | "groups" | "leads" | "campaigns"
  | "group_broadcast" | "private_broadcast" | "operations" | "notifications" | "settings";

type AccountRow = {
  id: string; name: string; status: "active" | "suspended";
  instance_limit: number; permissions: Record<string, boolean>; is_primary: boolean;
  used_instances: number; available_instances: number;
  profile: { name?: string; email?: string; role?: string } | null;
};

const permissionLabels: [PermissionKey, string][] = [
  ["overview", "Visão geral"], ["instances", "Instâncias"], ["groups", "Grupos"], ["leads", "Leads"],
  ["campaigns", "Campanhas"], ["group_broadcast", "Disparo em grupo"], ["private_broadcast", "Disparo privado"],
  ["operations", "Operações / logs"], ["notifications", "Notificações"], ["settings", "Configurações"],
];
const defaultPermissions = Object.fromEntries(permissionLabels.map(([key]) => [key, !["notifications","settings"].includes(key)])) as Record<PermissionKey, boolean>;

export default function AccountsManager() {
  const [accounts,setAccounts]=useState<AccountRow[]>([]);
  const [capacity,setCapacity]=useState({total:0,allocated:0,used:0,unallocated:0,free_physical:0});
  const [busy,setBusy]=useState(""); const [error,setError]=useState("");
  const [newClient,setNewClient]=useState({name:"",email:"",password:"",instance_limit:1,permissions:{...defaultPermissions}});

  async function load() {
    const response=await fetch("/api/admin/accounts",{cache:"no-store"});
    const body=await response.json();
    if(!response.ok) throw new Error(body?.error||"Erro ao carregar contas.");
    setAccounts(body.accounts||[]); setCapacity(body.capacity||{});
  }
  useEffect(()=>{load().catch((err)=>setError(err.message));},[]);
  const percentage=useMemo(()=>capacity.total?Math.min(100,Math.round((capacity.allocated/capacity.total)*100)):0,[capacity]);

  async function createClient(event:FormEvent){
    event.preventDefault(); setBusy("new"); setError("");
    try{
      const response=await fetch("/api/admin/accounts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(newClient)});
      const body=await response.json(); if(!response.ok) throw new Error(body?.error||"Erro ao criar cliente.");
      setAccounts(body.accounts||[]); setCapacity(body.capacity||capacity);
      setNewClient({name:"",email:"",password:"",instance_limit:1,permissions:{...defaultPermissions}});
    }catch(err){setError(err instanceof Error?err.message:"Erro ao criar cliente.");}finally{setBusy("");}
  }

  async function save(account:AccountRow){
    setBusy(account.id); setError("");
    try{
      const response=await fetch(`/api/admin/accounts/${account.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:account.name,status:account.status,instance_limit:account.instance_limit,permissions:account.permissions})});
      const body=await response.json(); if(!response.ok) throw new Error(body?.error||"Erro ao salvar."); await load();
    }catch(err){setError(err instanceof Error?err.message:"Erro ao salvar.");}finally{setBusy("");}
  }

  async function saveCapacity(value:number){
    setBusy("capacity"); setError("");
    try{
      const response=await fetch("/api/admin/system",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({global_instance_capacity:value})});
      const body=await response.json(); if(!response.ok) throw new Error(body?.error||"Erro ao salvar capacidade."); await load();
    }catch(err){setError(err instanceof Error?err.message:"Erro ao salvar capacidade.");}finally{setBusy("");}
  }

  function patchLocal(id:string,patch:Partial<AccountRow>){setAccounts((current)=>current.map((item)=>item.id===id?{...item,...patch}:item));}

  return <div style={{display:"grid",gap:18}}>
    {error?<div className="card" style={{padding:14,borderColor:"rgba(255,90,90,.35)",color:"#ff9b9b"}}>{error}</div>:null}
    <section className="card" style={{padding:20}}>
      <div className="row" style={{justifyContent:"space-between",gap:20,alignItems:"flex-end"}}>
        <div><div className="eyebrow">CAPACIDADE GLOBAL</div><h2 style={{margin:"4px 0"}}>{capacity.allocated} / {capacity.total} instâncias distribuídas</h2><p className="muted" style={{margin:0}}>{capacity.used} em uso • {capacity.unallocated} disponíveis para distribuir.</p></div>
        <label style={{display:"grid",gap:6,minWidth:190}}><span className="muted" style={{fontSize:12}}>Capacidade total</span><div className="row" style={{gap:8}}><input className="input" type="number" min={capacity.allocated} value={capacity.total} onChange={(e)=>setCapacity((c)=>({...c,total:Number(e.target.value)}))}/><button className="btn" disabled={busy==="capacity"} onClick={()=>saveCapacity(capacity.total)}>Salvar</button></div></label>
      </div>
      <div style={{marginTop:14,height:8,borderRadius:99,background:"rgba(255,255,255,.08)",overflow:"hidden"}}><div style={{width:`${percentage}%`,height:"100%",background:"#e7b34e"}}/></div>
    </section>

    <form className="card" style={{padding:20}} onSubmit={createClient}>
      <div className="eyebrow">NOVO CLIENTE</div><h2 style={{margin:"4px 0 16px"}}>Criar acesso</h2>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:10}}>
        <input className="input" required placeholder="Nome / empresa" value={newClient.name} onChange={(e)=>setNewClient((c)=>({...c,name:e.target.value}))}/>
        <input className="input" type="email" required placeholder="E-mail" value={newClient.email} onChange={(e)=>setNewClient((c)=>({...c,email:e.target.value}))}/>
        <input className="input" type="password" minLength={8} required placeholder="Senha inicial" value={newClient.password} onChange={(e)=>setNewClient((c)=>({...c,password:e.target.value}))}/>
        <input className="input" type="number" min={0} required value={newClient.instance_limit} onChange={(e)=>setNewClient((c)=>({...c,instance_limit:Number(e.target.value)}))}/>
      </div>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:14}}>
        {permissionLabels.map(([key,label])=><label key={key} className="badge" style={{cursor:"pointer",display:"inline-flex",alignItems:"center",gap:6}}><input type="checkbox" checked={newClient.permissions[key]} onChange={(e)=>setNewClient((c)=>({...c,permissions:{...c.permissions,[key]:e.target.checked}}))}/>{label}</label>)}
      </div>
      <button className="btn primary" type="submit" disabled={busy==="new"} style={{marginTop:16}}>{busy==="new"?"Criando...":"Criar cliente"}</button>
    </form>

    <div style={{display:"grid",gap:12}}>
      {accounts.map((account)=><section key={account.id} className="card" style={{padding:20}}>
        <div className="row" style={{justifyContent:"space-between",gap:14}}>
          <div><div className="row" style={{gap:8}}><h3 style={{margin:0}}>{account.name}</h3>{account.is_primary?<span className="badge ok">Principal</span>:null}<span className={`badge ${account.status==="active"?"ok":"warn"}`}>{account.status==="active"?"Ativa":"Suspensa"}</span></div><p className="muted" style={{margin:"6px 0 0"}}>{account.profile?.email||"Sem usuário"} • {account.used_instances}/{account.instance_limit} instâncias usadas</p></div>
          <button className="btn primary" disabled={busy===account.id} onClick={()=>save(account)}>{busy===account.id?"Salvando...":"Salvar"}</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"minmax(180px,1fr) 170px 170px",gap:10,marginTop:16}}>
          <input className="input" value={account.name} onChange={(e)=>patchLocal(account.id,{name:e.target.value})}/>
          <label style={{display:"grid",gap:5}}><span className="muted" style={{fontSize:11}}>Limite de instâncias</span><input className="input" type="number" min={account.used_instances} value={account.instance_limit} onChange={(e)=>patchLocal(account.id,{instance_limit:Number(e.target.value)})}/></label>
          <label style={{display:"grid",gap:5}}><span className="muted" style={{fontSize:11}}>Status</span><select className="input" disabled={account.is_primary} value={account.status} onChange={(e)=>patchLocal(account.id,{status:e.target.value as AccountRow["status"]})}><option value="active">Ativa</option><option value="suspended">Suspensa</option></select></label>
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:14}}>
          {permissionLabels.map(([key,label])=><label key={key} className="badge" style={{cursor:"pointer",display:"inline-flex",alignItems:"center",gap:6}}><input type="checkbox" checked={account.is_primary?true:account.permissions?.[key]===true} disabled={account.is_primary} onChange={(e)=>patchLocal(account.id,{permissions:{...account.permissions,[key]:e.target.checked}})}/>{label}</label>)}
        </div>
      </section>)}
    </div>
  </div>;
}
