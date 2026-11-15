import { createClient } from "@/lib/supabase/server";

export async function requireDriverSession() {
  const db = await createClient();
  if (!db) throw new Error("Autenticação não configurada.");
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) throw new Error("Sessão inválida ou expirada.");
  const { data: profile } = await db.from("profiles").select("display_name,role,active,must_change_password").eq("id", user.id).single();
  if (!profile?.active || profile.role !== "driver") throw new Error("Acesso exclusivo do motoboy.");
  if (profile.must_change_password) throw new Error("Troque sua senha antes de continuar.");
  return { db, user, profile };
}
