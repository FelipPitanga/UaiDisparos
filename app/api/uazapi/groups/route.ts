import { NextResponse } from "next/server";
import { UazapiProvider } from "@/lib/providers/uazapi";

export const dynamic = "force-dynamic";

export async function GET() {
  const baseUrl = process.env.UAZAPI_BASE_URL;
  const token = process.env.UAZAPI_TOKEN;

  if (!baseUrl || !token) {
    return NextResponse.json(
      { ok: false, error: "UAZAPI_BASE_URL ou UAZAPI_TOKEN não configurados." },
      { status: 500 },
    );
  }

  try {
    const provider = new UazapiProvider({ baseUrl, token });
    const data = await provider.listGroups(false);
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Falha desconhecida ao consultar a UAZAPI.",
      },
      { status: 502 },
    );
  }
}
