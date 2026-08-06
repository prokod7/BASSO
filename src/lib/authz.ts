import { createClient } from "@/lib/supabase/server";

export type OperationalRole = "manager" | "counter" | "waiter" | "kitchen" | "bar" | "driver" | "finance" | "viewer";
export interface AuthContext {
  userId: string;
  role: OperationalRole;
  displayName: string;
  permissions: Record<string, boolean>;
}

/**
 * Aplica duas camadas de autorização:
 * 1. o perfil precisa estar entre os papéis permitidos para a operação;
 * 2. uma permissão explicitamente desativada no painel bloqueia a ação.
 *
 * Perfis antigos sem a chave de permissão preservam o comportamento do papel,
 * evitando bloquear a operação durante a migração.
 */
export async function requireOperationalRole(allowed: OperationalRole[], permission?: string): Promise<AuthContext> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
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
