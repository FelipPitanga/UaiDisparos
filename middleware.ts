import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

type PermissionKey =
  | "overview" | "instances" | "groups" | "leads" | "campaigns"
  | "group_broadcast" | "private_broadcast" | "operations" | "notifications" | "settings";

const AUTH_PAGES = ["/login", "/cadastro"];
const PASS_THROUGH_PAGES = ["/sem-acesso", "/conta-bloqueada"];
const PUBLIC_API_PREFIXES = [
  "/api/health",
  "/api/webhooks/uazapi",
  "/api/jobs/process",
  "/api/private-jobs/process",
  "/api/notifications/process",
];

function permissionForPath(pathname: string): PermissionKey | "admin" | null {
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) return "admin";
  if (pathname.startsWith("/disparos/privado") || pathname.startsWith("/api/private-broadcasts")) return "private_broadcast";
  if (pathname === "/disparos" || pathname.startsWith("/api/automations")) return "group_broadcast";
  if (pathname.startsWith("/instancias") || pathname.startsWith("/api/uazapi/instances") || pathname.startsWith("/api/uazapi/check-instance-statuses")) return "instances";
  if (pathname.startsWith("/grupos") || pathname.startsWith("/api/groups") || pathname.startsWith("/api/uazapi/sync-groups") || pathname.startsWith("/api/uazapi/sync-all-monitors")) return "groups";
  if (pathname.startsWith("/leads")) return "leads";
  if (pathname.startsWith("/campanhas") || pathname.startsWith("/api/campaigns")) return "campaigns";
  if (pathname.startsWith("/operacoes") || pathname.startsWith("/logs")) return "operations";
  if (pathname.startsWith("/notificacoes") || pathname.startsWith("/api/notifications/settings")) return "admin";
  if (pathname.startsWith("/configuracoes")) return "admin";
  if (pathname.startsWith("/api/uazapi/send") || pathname.startsWith("/api/uazapi/groups")) return "admin";
  if (pathname === "/") return "overview";
  return null;
}

function copyCookies(source: NextResponse, target: NextResponse) {
  for (const cookie of source.cookies.getAll()) target.cookies.set(cookie);
  return target;
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isApi = pathname.startsWith("/api/");
  const isAuthPage = AUTH_PAGES.some((path) => pathname === path || pathname.startsWith(path + "/"));
  const isPassThrough = PASS_THROUGH_PAGES.some((path) => pathname === path || pathname.startsWith(path + "/"));
  const isPublicApi = PUBLIC_API_PREFIXES.some((path) => pathname === path || pathname.startsWith(path + "/"));
  if (isPublicApi) return NextResponse.next();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !secret) {
    return NextResponse.json({ ok: false, error: "Configuração de autenticação incompleta." }, { status: 500 });
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete("x-uai-user-id");
  requestHeaders.delete("x-uai-account-id");
  requestHeaders.delete("x-uai-role");

  let response = NextResponse.next({ request: { headers: requestHeaders } });
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: requestHeaders } });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    if (isAuthPage) return response;
    if (isApi) return copyCookies(response, NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 }));
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return copyCookies(response, NextResponse.redirect(loginUrl));
  }

  if (isAuthPage) {
    const home = request.nextUrl.clone();
    home.pathname = "/";
    home.search = "";
    return copyCookies(response, NextResponse.redirect(home));
  }

  const admin = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: profile } = await admin.from("profiles")
    .select("user_id,account_id,name,email,role").eq("user_id", user.id).maybeSingle();

  if (!profile) {
    if (isApi) return copyCookies(response, NextResponse.json({ ok: false, error: "Perfil da conta não encontrado." }, { status: 403 }));
    const blocked = request.nextUrl.clone();
    blocked.pathname = "/conta-bloqueada";
    blocked.searchParams.set("motivo", "perfil");
    return copyCookies(response, NextResponse.redirect(blocked));
  }

  const { data: account } = await admin.from("accounts")
    .select("id,name,status,instance_limit,permissions").eq("id", profile.account_id).maybeSingle();

  if (!account) {
    if (isApi) return copyCookies(response, NextResponse.json({ ok: false, error: "Conta não encontrada." }, { status: 403 }));
    const blocked = request.nextUrl.clone();
    blocked.pathname = "/conta-bloqueada";
    blocked.searchParams.set("motivo", "conta");
    return copyCookies(response, NextResponse.redirect(blocked));
  }

  const role = String(profile.role || "client");
  if (account.status !== "active" && role !== "super_admin" && !isPassThrough) {
    if (isApi) return copyCookies(response, NextResponse.json({ ok: false, error: "Conta suspensa." }, { status: 403 }));
    const blocked = request.nextUrl.clone();
    blocked.pathname = "/conta-bloqueada";
    blocked.searchParams.set("motivo", "suspensa");
    return copyCookies(response, NextResponse.redirect(blocked));
  }

  const required = permissionForPath(pathname);
  const permissions = (account.permissions || {}) as Record<string, boolean>;
  const isSuperAdmin = role === "super_admin";

  if (required === "admin" && !isSuperAdmin) {
    if (isApi) return copyCookies(response, NextResponse.json({ ok: false, error: "Acesso administrativo necessário." }, { status: 403 }));
    const denied = request.nextUrl.clone();
    denied.pathname = "/sem-acesso";
    denied.searchParams.set("rota", "admin");
    return copyCookies(response, NextResponse.redirect(denied));
  }

  if (required && required !== "admin" && !isSuperAdmin && permissions[required] !== true) {
    if (isApi) return copyCookies(response, NextResponse.json({ ok: false, error: "Módulo bloqueado para esta conta." }, { status: 403 }));
    const denied = request.nextUrl.clone();
    denied.pathname = "/sem-acesso";
    denied.searchParams.set("rota", required);
    return copyCookies(response, NextResponse.redirect(denied));
  }

  requestHeaders.set("x-uai-user-id", user.id);
  requestHeaders.set("x-uai-account-id", String(profile.account_id));
  requestHeaders.set("x-uai-role", role);

  const finalResponse = NextResponse.next({ request: { headers: requestHeaders } });
  return copyCookies(response, finalResponse);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
