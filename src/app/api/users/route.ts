import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

const createSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(2).max(100),
  role: z.enum(["manager", "counter", "waiter", "kitchen", "bar", "driver", "finance", "viewer"]),
  password: z.string().min(12).max(128).optional(),
  active: z.boolean().default(true)
});

export async function GET(request: NextRequest) {
  try {
    const optionsOnly = request.nextUrl.searchParams.get("options") === "1";
    if (optionsOnly) {
      await requireOperationalRole(["manager", "counter", "waiter", "kitchen", "bar", "driver", "finance", "viewer"]);
      const db = createAdminClient();
      if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
      const { data, error } = await db.from("profiles").select("id,display_name,role").eq("active", true).order("display_name");
      if (error) throw error;
      return NextResponse.json({ users: data || [] }, { headers: { "Cache-Control": "no-store" } });
    }
    await requireOperationalRole(["manager"], "users.manage");
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const [{ data: profiles, error }, authResult] = await Promise.all([
      db.from("profiles").select("id,display_name,role,active,device_limit,permissions,created_at,updated_at").order("created_at"),
      db.auth.admin.listUsers({ page: 1, perPage: 1000 })
    ]);
    if (error) throw error;
    if (authResult.error) throw authResult.error;
    const authMap = new Map<string, any>((authResult.data.users as any[]).map(user => [user.id, user]));
    const users = (profiles || []).map(profile => {
      const user = authMap.get(profile.id);
      return { ...profile, email: user?.email || "", lastSignInAt: user?.last_sign_in_at || undefined, emailConfirmedAt: user?.email_confirmed_at || undefined };
    });
    return NextResponse.json({ users }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao consultar usuários." }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOperationalRole(["manager"], "users.manage");
    const body = createSchema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const generatedPassword = body.password || `${randomBytes(9).toString("base64url")}Aa1!`;
    const { data, error } = await db.auth.admin.createUser({ email: body.email.toLowerCase(), password: generatedPassword, email_confirm: true, user_metadata: { display_name: body.displayName, role: body.role } });
    if (error) throw error;
    const { error: profileError } = await db.from("profiles").insert({ id: data.user.id, display_name: body.displayName, role: body.role, active: body.active });
    if (profileError) {
      await db.auth.admin.deleteUser(data.user.id);
      throw profileError;
    }
    await db.from("audit_logs").insert({ actor_id: auth.userId === "demo" ? null : auth.userId, actor_label: auth.displayName, action: "USER_CREATED", entity_type: "profile", entity_id: data.user.id, after_data: { email: body.email, displayName: body.displayName, role: body.role, active: body.active } });
    return NextResponse.json({ id: data.user.id, temporaryPassword: body.password ? undefined : generatedPassword }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Usuário inválido." }, { status: 400 });
  }
}
