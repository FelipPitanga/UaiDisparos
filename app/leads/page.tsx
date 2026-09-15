import { getSupabaseAdmin } from "@/lib/supabase/server";
import LiveRefresh from "../disparos/LiveRefresh";

export const dynamic = "force-dynamic";

function dateLabel(value: string | null) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function consentLabel(value: string) {
  if (value === "opt_in" || value === "opt-in" || value === "granted") return "Autorizado";
  if (value === "denied" || value === "opt_out" || value === "opt-out") return "Bloqueado";
  return "Não definido";
}

function consentClass(value: string) {
  if (value === "opt_in" || value === "opt-in" || value === "granted") return "ok";
  if (value === "denied" || value === "opt_out" || value === "opt-out") return "bad";
  return "warn";
}

function identityType(lead: { phone?: string | null; lid?: string | null }) {
  if (lead.phone && lead.lid) return "Telefone + LID";
  if (lead.lid) return "LID";
  if (lead.phone) return "Telefone";
  return "Identificador";
}

export default async function Page() {
  const supabase = getSupabaseAdmin();

  const { data: leads, error } = await supabase
    .from("leads")
    .select("id,instance_id,group_id,external_participant_id,phone,lid,consent_status,status,source_group_external_id,capture_count,first_seen_at,last_seen_at,created_at")
    .order("last_seen_at", { ascending: false })
    .limit(500);

  const instanceIds = Array.from(new Set((leads ?? []).map((x) => x.instance_id).filter(Boolean))) as string[];
  const groupIds = Array.from(new Set((leads ?? []).map((x) => x.group_id).filter(Boolean))) as string[];

  const [{ data: instances }, { data: groups }] = await Promise.all([
    instanceIds.length
      ? supabase.from("instances").select("id,name").in("id", instanceIds)
      : Promise.resolve({ data: [] as any[] }),
    groupIds.length
      ? supabase.from("groups").select("id,name,external_id,metadata").in("id", groupIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const instanceMap = new Map((instances ?? []).map((item: any) => [item.id, item.name]));
  const groupMap = new Map((groups ?? []).map((item: any) => [item.id, item]));

  const total = (leads ?? []).length;
  const uniquePhones = new Set((leads ?? []).map((x) => x.phone).filter(Boolean)).size;
  const withLid = (leads ?? []).filter((x) => Boolean(x.lid)).length;
  const lidOnly = (leads ?? []).filter((x) => !x.phone && Boolean(x.lid)).length;
  const duplicateCaptures = (leads ?? []).reduce((sum, x) => sum + Math.max(0, Number(x.capture_count || 1) - 1), 0);
  const authorized = (leads ?? []).filter((x) => ["opt_in", "opt-in", "granted"].includes(x.consent_status)).length;

  return (
    <>
      <div className="row" style={{ justifyContent: "flex-end", marginBottom: 10 }}>
        <LiveRefresh intervalMs={1000} />
      </div>
      <div className="topbar">
        <div>
          <h1>Leads</h1>
          <div className="subtitle">Entradas reais capturadas dos grupos e comunidades. Telefone e @lid são tratados como identidades válidas.</div>
        </div>
      </div>

      <div className="instance-summary-grid">
        <div className="card"><div className="label">Leads únicos</div><div className="metric">{total}</div></div>
        <div className="card"><div className="label">Com telefone</div><div className="metric">{uniquePhones}</div></div>
        <div className="card"><div className="label">Com LID</div><div className="metric">{withLid}</div><div className="muted" style={{ marginTop: 4 }}>{lidOnly} somente @lid</div></div>
        <div className="card"><div className="label">Duplicadas evitadas</div><div className="metric">{duplicateCaptures}</div></div>
        <div className="card"><div className="label">Autorizados</div><div className="metric">{authorized}</div></div>
      </div>

      {error ? <div className="alert-error">Erro ao carregar leads: {error.message}</div> : null}

      <div className="table-wrap" style={{ marginTop: 18 }}>
        <table>
          <thead>
            <tr>
              <th>Identidade</th><th>Telefone</th><th>LID / identificador</th><th>Grupo / comunidade</th><th>Monitor de origem</th><th>Capturas</th><th>Consentimento</th><th>Última entrada</th>
            </tr>
          </thead>
          <tbody>
            {(leads ?? []).map((lead) => {
              const group: any = lead.group_id ? groupMap.get(lead.group_id) : null;
              const community = Boolean(group?.metadata?.is_parent || group?.metadata?.is_community || group?.metadata?.linked_parent || group?.metadata?.addressing_mode === "lid");
              return (
                <tr key={lead.id}>
                  <td><span className={`badge ${lead.lid ? "ok" : ""}`}>{identityType(lead)}</span></td>
                  <td>{lead.phone ? `+${lead.phone}` : "—"}</td>
                  <td>{lead.lid || lead.external_participant_id || "—"}</td>
                  <td>
                    <div style={{ fontWeight: 700 }}>{group?.name || "Grupo não localizado"}</div>
                    <div className="muted" style={{ marginTop: 3 }}>{community ? "Comunidade / LID • " : "Grupo • "}{lead.source_group_external_id || group?.external_id || "—"}</div>
                  </td>
                  <td>{lead.instance_id ? instanceMap.get(lead.instance_id) || "—" : "—"}</td>
                  <td><span className={`badge ${Number(lead.capture_count || 1) > 1 ? "warn" : ""}`}>{lead.capture_count || 1}x</span></td>
                  <td><span className={`badge ${consentClass(lead.consent_status)}`}>{consentLabel(lead.consent_status)}</span></td>
                  <td>{dateLabel(lead.last_seen_at)}</td>
                </tr>
              );
            })}
            {!leads?.length ? <tr><td colSpan={8}>Nenhum lead capturado ainda.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
