import { NextRequest, NextResponse } from "next/server";
import { UazapiProvider } from "@/lib/providers/uazapi";

export const dynamic = "force-dynamic";

function normalizeNumber(value: string) {
  return value.trim().replace(/[^0-9@g.uslidwhatsapp.net_-]/gi, "");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const number = normalizeNumber(String(body?.number ?? ""));
    const text = String(body?.text ?? "").trim();
    const mediaUrl = String(body?.mediaUrl ?? "").trim();
    const mediaType = String(body?.mediaType ?? "image").trim();
    const authorized = body?.authorized === true;

    if (!authorized) {
      return NextResponse.json(
        { ok: false, error: "Confirme que o destinatário autorizou o contato antes de enviar." },
        { status: 400 },
      );
    }

    if (!number) {
      return NextResponse.json({ ok: false, error: "Informe o número ou chat ID." }, { status: 400 });
    }

    if (!text && !mediaUrl) {
      return NextResponse.json({ ok: false, error: "Informe uma mensagem ou mídia." }, { status: 400 });
    }

    const baseUrl = process.env.UAZAPI_BASE_URL?.replace(/\/$/, "");
    const token = process.env.UAZAPI_TOKEN;

    if (!baseUrl || !token) {
      return NextResponse.json(
        { ok: false, error: "UAZAPI_BASE_URL ou UAZAPI_TOKEN não configurado." },
        { status: 500 },
      );
    }

    const provider = new UazapiProvider({ baseUrl, token });
    const data = mediaUrl
      ? await provider.sendMedia({
          number,
          text,
          file: mediaUrl,
          type: ["image", "video", "audio", "ptt", "document", "sticker"].includes(mediaType)
            ? (mediaType as "image" | "video" | "audio" | "ptt" | "document" | "sticker")
            : "image",
        })
      : await provider.sendText({ number, text, linkPreview: false });

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
