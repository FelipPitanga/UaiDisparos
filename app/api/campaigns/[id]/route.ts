import { NextRequest, NextResponse } from "next/server";
import { getSupabaseSession } from "@/lib/supabase/session";
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

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const accountId = requireTenantId();
    const body = await req.json();
    const name = String(body?.name || "").trim().slice(0, 100);
    const text = String(body?.text_content || "").trim();
    const mediaUrl = String(body?.media_url || "").trim() || null;
    const mediaType = ["none", "image", "video", "audio", "ptt", "document", "sticker"].includes(String(body?.media_type)) ? String(body.media_type) : "none";
    const footerText = String(body?.footer_text || "").trim().slice(0, 100) || null;
    const status = body?.status === "draft" ? "draft" : "active";

    if (!name) return NextResponse.json({ ok: false, error: "Informe o nome da campanha." }, { status: 400 });

    const supabase = getSupabaseSession();
    const { data, error } = await supabase.from("campaigns").update({
      name,
      status,
      text_content: text || null,
      media_url: mediaUrl,
      media_type: mediaUrl ? mediaType : "none",
      footer_text: footerText,
      buttons: cleanButtons(body?.buttons),
      updated_at: new Date().toISOString(),
    }).eq("id", params.id).eq("account_id", accountId).select("*").single();

    if (error) throw error;
    return NextResponse.json({ ok: true, campaign: data });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Erro ao atualizar campanha." }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const accountId = requireTenantId();
    const supabase = getSupabaseSession();
    const now = new Date().toISOString();
    const { error } = await supabase.from("campaigns").update({ status: "archived", updated_at: now }).eq("id", params.id).eq("account_id", accountId);
    if (error) throw error;
    await supabase.from("group_automations").update({ active: false, updated_at: now }).eq("campaign_id", params.id).eq("account_id", accountId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Erro ao arquivar campanha." }, { status: 500 });
  }
}
