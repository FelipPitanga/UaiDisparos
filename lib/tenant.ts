import { headers } from "next/headers";

export type PermissionKey =
  | "overview" | "instances" | "groups" | "leads" | "campaigns"
  | "group_broadcast" | "private_broadcast" | "operations" | "notifications" | "settings";

export type TenantContext = {
  userId: string;
  accountId: string;
  role: "super_admin" | "admin" | "client";
};

export function getTenantContext(): TenantContext {
  const h = headers();
  const userId = h.get("x-uai-user-id") || "";
  const accountId = h.get("x-uai-account-id") || "";
  const role = (h.get("x-uai-role") || "client") as TenantContext["role"];
  if (!userId || !accountId) throw new Error("Contexto de conta não disponível.");
  return { userId, accountId, role };
}

export function requireTenantId() {
  return getTenantContext().accountId;
}

export function requireSuperAdmin() {
  const context = getTenantContext();
  if (context.role !== "super_admin") throw new Error("Acesso restrito ao administrador.");
  return context;
}
