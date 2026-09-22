import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireTenantId } from "@/lib/tenant";

export const dynamic = "force-dynamic";

function cleanButtons(value: any) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 3).map((item, index) => {
    const id = String(item?.id || `btn_${index + 1}`).trim().slice(0, 50);
    const type = ["reply", "url", "call", "copy"].includes(String(item?.type)) ? String(item.type) : "reply";
    const rawLabel = String(item?.label || "").trim().slice(0, 30);
    const rawValue = String(item?.value || "").trim().slice(0, 250);
    const label = rawLabel || rawValue.slice(0, 30);
    const value = type === "reply" ? (rawValue || id) : rawValue;
    return { id, label, value, type };
  }).filter((item) => item.label && item.value);
}

export async function POST(req: NextRequest) {
  try {
    const accountId = requireTenantId();
    const body = await req.json();
    const name = String(body?.name || "").trim().slice(0, 100);
    const text = String(body?.text_content || "").trim();
    const mediaUrl = String(body?.media_url || "").trim() || null;
    const mediaType = ["none", "image", "video", "audio", "ptt", "document", "sticker"].includes(String(body?.media_type)) ? String(body.media_type) : "none";
    const footerText = String(body?.footer_text || "").trim().slice(0, 100) || null;
    const buttons = cleanButtons(body?.buttons);

    if (!name) return NextResponse.json({ ok: false, error: "Informe o nome da campanha." }, { status: 400 });
    if (!text && !mediaUrl) return NextResponse.json({ ok: false, error: "Informe texto ou mídia." }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("campaigns").insert({
      account_id: accountId,
      name,
      status: "active",
      text_content: text || null,
      media_url: mediaUrl,
      media_type: mediaUrl ? mediaType : "none",
      footer_text: footerText,
      buttons,
      require_consent: true,
      updated_at: new Date().toISOString(),
    }).select("*").single();

    if (error) throw error;
    return NextResponse.json({ ok: true, campaign: data });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Erro ao salvar campanha." }, { status: 500 });
  }
}
