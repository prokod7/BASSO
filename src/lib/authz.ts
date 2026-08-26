import { createClient } from "@/lib/supabase/server";

export type OperationalRole = "manager" | "counter" | "waiter" | "kitchen" | "bar" | "driver" | "finance" | "viewer";
export interface AuthContext {
  userId: string;
  role: OperationalRole;
  displayName: string;
  permissions: Record<string, boolean>;
}

function isDevelopmentDemoMode() {
  return process.env.NODE_ENV !== "production" && process.env.DEMO_MODE === "true";
}

/**
 * Aplica duas camadas de autorização:
 * 1. o perfil precisa estar entre os papéis permitidos para a operação;
 * 2. uma permissão explicitamente desativada no painel bloqueia a ação.
 *
 * O modo de demonstração só pode existir fora de produção e exige opt-in
 * explícito por variável exclusivamente server-side (DEMO_MODE=true).
 */
export async function requireOperationalRole(allowed: OperationalRole[], permission?: string): Promise<AuthContext> {
  if (isDevelopmentDemoMode()) {
    return { userId: "demo", role: "manager", displayName: "Gestor Demo", permissions: {} };
  }

  const client = await createClient();
  if (!client) throw new Error("Autenticação não configurada.");

  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) throw new Error("Sessão inválida ou expirada.");

  const { data: profile, error } = await client
    .from("profiles")
    .select("display_name,role,active,permissions")
    .eq("id", user.id)
    .single();

  if (error || !profile?.active) throw new Error("Usuário bloqueado ou sem perfil.");

  const role = profile.role as OperationalRole;
  if (!allowed.includes(role)) throw new Error("Acesso não autorizado para este perfil.");

  const permissions = (profile.permissions && typeof profile.permissions === "object" ? profile.permissions : {}) as Record<string, boolean>;
  if (permission && role !== "manager" && permissions[permission] === false) {
    throw new Error("Esta permissão foi desativada para o seu usuário.");
  }

  return { userId: user.id, role, displayName: profile.display_name, permissions };
}
