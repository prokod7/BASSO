import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  displayName: z.string().min(2).max(100).optional(),
  role: z.enum(["manager", "counter", "waiter", "kitchen", "bar", "driver", "finance", "viewer"]).optional(),
  active: z.boolean().optional(),
  password: z.string().min(10).max(128).optional(),
  deviceLimit: z.number().int().min(1).max(20).optional(),
  permissions: z.record(z.string(), z.boolean()).optional(),
  forcePasswordChange: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireOperationalRole(["manager"], "users.manage");
    const { id } = await params;
    if (id === auth.userId) throw new Error("Altere sua própria senha pela tela de segurança da conta.");
    const body = schema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { data: before, error: beforeError } = await db.from("profiles").select("*").eq("id", id).single();
    if (beforeError) throw beforeError;
    const profile: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.displayName !== undefined) profile.display_name = body.displayName;
    if (body.role !== undefined) profile.role = body.role;
    if (body.active !== undefined) profile.active = body.active;
    if (body.deviceLimit !== undefined) profile.device_limit = body.deviceLimit;
    if (body.permissions !== undefined) profile.permissions = body.permissions;
    if (body.forcePasswordChange !== undefined) profile.must_change_password = body.forcePasswordChange;
    if (body.password) profile.must_change_password = true;
    const { error } = await db.from("profiles").update(profile).eq("id", id);
    if (error) throw error;
    if (body.password) {
      const { error: authError } = await db.auth.admin.updateUserById(id, { password: body.password });
      if (authError) throw authError;
    }
    await db.from("audit_logs").insert({ actor_id: auth.userId === "demo" ? null : auth.userId, actor_label: auth.displayName, action: "USER_UPDATED", entity_type: "profile", entity_id: id, before_data: before, after_data: { ...profile, passwordChanged: Boolean(body.password) } });
    return NextResponse.json({ saved: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao atualizar usuário." }, { status: 400 });
  }
}
