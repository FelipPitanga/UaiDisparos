import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { processJob } from "@/lib/automation";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const supabase = getSupabaseAdmin();
    const { data: jobs, error } = await supabase
      .from("jobs")
      .select("id")
      .in("status", ["queued", "failed"])
      .order("created_at", { ascending: true })
      .limit(20);

    if (error) throw error;

    const results = [];
    for (const job of jobs ?? []) {
      try {
        results.push({ id: job.id, result: await processJob(job.id) });
      } catch (error) {
        results.push({ id: job.id, result: { ok: false, error: error instanceof Error ? error.message : "Erro" } });
      }
    }

    return NextResponse.json({ ok: true, processed: results.length, results });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Erro ao processar fila." }, { status: 500 });
  }
}
