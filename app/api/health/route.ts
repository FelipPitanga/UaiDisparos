import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  const checks = {
    supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabaseServerKey: Boolean(
      process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
    uazapiBaseUrl: Boolean(process.env.UAZAPI_BASE_URL),
    uazapiAdminToken: Boolean(process.env.UAZAPI_ADMIN_TOKEN),
    uazapiWebhookUrl: Boolean(process.env.UAZAPI_WEBHOOK_URL),
  };

  const ok = Object.values(checks).every(Boolean);

  return NextResponse.json(
    {
      ok,
      service: "UaiDisparos",
      runtime: "cloudflare-worker",
      checks,
      checkedAt: new Date().toISOString(),
    },
    {
      status: ok ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
