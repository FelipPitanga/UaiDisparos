import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function cleanButtons(value: any) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 3).map((item, index) => {
    const id = String(item?.id || `btn_${index + 1}`).trim().slice(0, 50);
    const label = String(item?.label || "").trim().slice(0, 30);
    const type = ["reply", "url", "call", "copy"].includes(String(item?.type)) ? String(item.type) : "reply";
    const rawValue = String(item?.value || "").trim().slice(0, 250);
    const value = type === "reply" ? (rawValue || id) : rawValue;
    return { id, label, value, type };
  }).filter((item) => item.label && item.value);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const name = String(body?.name || "").trim().slice(0, 100);
    const text = String(body?.text_content || "").trim();
    const mediaUrl = String(body?.media_url || "").trim() || null;
    const mediaType = ["none", "image", "video", "audio", "ptt", "document", "sticker"].includes(String(body?.media_type)) ? String(body.media_type) : "none";
    const footerText = String(body?.footer_text || "").trim().slice(0, 100) || null;
    const status = body?.status === "draft" ? "draft" : "active";

    if (!name) return NextResponse.json({ ok: false, error: "Informe o nome da campanha." }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("campaigns").update({
      name,
      status,
      text_content: text || null,
      media_url: mediaUrl,
      media_type: mediaUrl ? mediaType : "none",
      footer_text: footerText,
      buttons: cleanButtons(body?.buttons),
      updated_at: new Date().toISOString(),
    }).eq("id", params.id).select("*").single();

    if (error) throw error;
    return NextResponse.json({ ok: true, campaign: data });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Erro ao atualizar campanha." }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();
    const { error } = await supabase.from("campaigns").update({ status: "archived", updated_at: now }).eq("id", params.id);
    if (error) throw error;
    await supabase.from("group_automations").update({ active: false, updated_at: now }).eq("campaign_id", params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Erro ao arquivar campanha." }, { status: 500 });
  }
}
