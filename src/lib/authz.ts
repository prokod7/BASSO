import { createClient } from "@/lib/supabase/server";

export type OperationalRole = "manager" | "counter" | "waiter" | "kitchen" | "bar" | "driver" | "finance" | "viewer";
export interface AuthContext { userId: string; role: OperationalRole; displayName: string; }

export async function requireOperationalRole(allowed: OperationalRole[]): Promise<AuthContext> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") return { userId: "demo", role: "manager", displayName: "Gestor Demo" };
  const client = await createClient();
  if (!client) throw new Error("Autenticação não configurada.");
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) throw new Error("Sessão inválida ou expirada.");
  const { data: profile, error } = await client.from("profiles").select("display_name,role,active").eq("id", user.id).single();
  if (error || !profile?.active) throw new Error("Usuário bloqueado ou sem perfil.");
  if (!allowed.includes(profile.role as OperationalRole)) throw new Error("Acesso não autorizado para este perfil.");
  return { userId: user.id, role: profile.role as OperationalRole, displayName: profile.display_name };
}
