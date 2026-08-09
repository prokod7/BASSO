import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ password: z.string().min(10).max(128) });

export async function POST(request: NextRequest) {
  try {
    const body = schema.parse(await request.json());
    const client = await createClient();
    if (!client) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Sessão inválida ou expirada." }, { status: 401 });
    const { error } = await client.auth.updateUser({ password: body.password });
    if (error) throw error;
    const admin = createAdminClient();
    if (admin) {
      await admin.from("profiles").update({ must_change_password: false, password_changed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", user.id);
      await admin.from("audit_logs").insert({ actor_id: user.id, actor_label: user.email || "Usuário", action: "PASSWORD_CHANGED", entity_type: "profile", entity_id: user.id, after_data: { selfService: true } });
    }
    return NextResponse.json({ changed: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao alterar senha." }, { status: 400 });
  }
}
