import { NextResponse } from "next/server";
import { processPrivateQueue } from "@/lib/privateAutomation";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const results = await processPrivateQueue(25);
    return NextResponse.json({ ok: true, processed: results.length, results });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Erro ao processar fila privada." }, { status: 500 });
  }
}
