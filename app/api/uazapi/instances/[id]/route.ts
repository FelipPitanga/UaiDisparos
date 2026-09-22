import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireTenantId } from "@/lib/tenant";

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const accountId = requireTenantId();
    const supabase = getSupabaseAdmin();
    const { data: record, error } = await supabase.from("instances")
      .select("id,name,base_url,api_token").eq("id", params.id).eq("account_id", accountId).single();
    if (error || !record) return NextResponse.json({ ok: false, error: "Instância não encontrada." }, { status: 404 });

    if (record.base_url && record.api_token) {
      const response = await fetch(String(record.base_url).replace(/\/$/, "") + "/instance", {
        method: "DELETE", headers: { Accept: "application/json", token: record.api_token }, cache: "no-store",
      });
      if (!response.ok && response.status !== 404) {
        const text = await response.text();
        let provider: unknown = text;
        try { provider = text ? JSON.parse(text) : null; } catch {}
        return NextResponse.json({ ok: false, error: "A UAZAPI não conseguiu excluir a instância (" + response.status + "): " + (typeof provider === "string" ? provider : JSON.stringify(provider)) }, { status: 502 });
      }
    }

    const { error: deleteError } = await supabase.from("instances").delete().eq("id", record.id).eq("account_id", accountId);
    if (deleteError) return NextResponse.json({ ok: false, error: deleteError.message }, { status: 500 });
    return NextResponse.json({ ok: true, deletedId: record.id });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Erro ao excluir instância." }, { status: 500 });
  }
}
