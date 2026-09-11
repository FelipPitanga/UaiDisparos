import { getSupabaseAdmin } from "@/lib/supabase/server";
import SyncButton from "./SyncButton";

export const dynamic = "force-dynamic";

export default async function Page() {
  const supabase = getSupabaseAdmin();
  const { data: groups, error } = await supabase
    .from("groups")
    .select("id,name,external_id,member_count,monitoring_enabled,updated_at")
    .order("name", { ascending: true });

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Grupos</h1>
          <div className="subtitle">Grupos sincronizados da UAZAPI.</div>
        </div>
        <SyncButton />
      </div>

      {error ? (
        <div className="card">
          <div className="label">Erro ao carregar grupos</div>
          <div className="subtitle">{error.message}</div>
        </div>
      ) : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Grupo</th>
              <th>ID</th>
              <th>Participantes</th>
              <th>Monitoramento</th>
            </tr>
          </thead>
          <tbody>
            {(groups ?? []).map((group) => (
              <tr key={group.id}>
                <td>{group.name || "Sem nome"}</td>
                <td>{group.external_id}</td>
                <td>{group.member_count ?? "—"}</td>
                <td>
                  <span className={`badge ${group.monitoring_enabled ? "ok" : "warn"}`}>
                    {group.monitoring_enabled ? "Ativo" : "Pausado"}
                  </span>
                </td>
              </tr>
            ))}
            {!groups?.length ? (
              <tr>
                <td colSpan={4}>Nenhum grupo sincronizado ainda.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
