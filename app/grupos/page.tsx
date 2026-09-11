import { getSupabaseAdmin } from "@/lib/supabase/server";
import SyncButton from "./SyncButton";
import MonitorToggle from "./MonitorToggle";

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
          <div className="subtitle">Escolha quais grupos o UaiDisparos deve monitorar em tempo real.</div>
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
                <td><MonitorToggle id={group.id} initialEnabled={Boolean(group.monitoring_enabled)} /></td>
              </tr>
            ))}
            {!groups?.length ? (
              <tr><td colSpan={4}>Nenhum grupo sincronizado ainda.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
