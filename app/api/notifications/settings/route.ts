import { NextResponse } from "next/server";
import { getSupabaseSession } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";

function cleanUrl(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const supabase = getSupabaseSession();
    const { data, error } = await supabase
      .from("notification_settings")
      .select("group_sent_url,private_sent_url,disconnected_url,updated_at")
      .eq("id", 1)
      .single();

    if (error) throw error;
    return NextResponse.json({ ok: true, settings: data });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Erro ao carregar notificações." },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const values = {
      group_sent_url: cleanUrl(body?.group_sent_url),
      private_sent_url: cleanUrl(body?.private_sent_url),
      disconnected_url: cleanUrl(body?.disconnected_url),
      updated_at: new Date().toISOString(),
    };

    const supplied = [body?.group_sent_url, body?.private_sent_url, body?.disconnected_url];
    const normalized = [values.group_sent_url, values.private_sent_url, values.disconnected_url];
    for (let i = 0; i < supplied.length; i += 1) {
      if (String(supplied[i] ?? "").trim() && !normalized[i]) {
        return NextResponse.json({ ok: false, error: "Use uma URL http:// ou https:// válida." }, { status: 400 });
      }
    }

    const supabase = getSupabaseSession();
    const { data, error } = await supabase
      .from("notification_settings")
      .upsert({ id: 1, ...values }, { onConflict: "id" })
      .select("group_sent_url,private_sent_url,disconnected_url,updated_at")
      .single();

    if (error) throw error;
    return NextResponse.json({ ok: true, settings: data });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Erro ao salvar notificações." },
      { status: 500 },
    );
  }
}
