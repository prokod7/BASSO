import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  name: z.string().min(2).max(120),
  channel: z.enum(["manual_whatsapp", "push", "email"]),
  body: z.string().min(1).max(2000),
  active: z.boolean(),
  sortOrder: z.number().int().min(0).max(10000),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const auth = await requireOperationalRole(["manager"], "settings.manage");
    const { key } = await params;
    const body = schema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { data: current, error: currentError } = await db.from("communication_templates").select("*").eq("key", key).single();
    if (currentError) throw currentError;
    const payload = { name: body.name.trim(), channel: body.channel, body: body.body.trim(), active: body.active, sort_order: body.sortOrder, updated_by: auth.userId === "demo" ? null : auth.userId, updated_at: new Date().toISOString() };
    const { error } = await db.from("communication_templates").update(payload).eq("key", key);
    if (error) throw error;
    await db.from("audit_logs").insert({ actor_id: auth.userId === "demo" ? null : auth.userId, actor_label: auth.displayName, action: "COMMUNICATION_TEMPLATE_UPDATED", entity_type: "communication_template", entity_id: key, before_data: current, after_data: payload });
    return NextResponse.json({ saved: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao atualizar mensagem." }, { status: 400 });
  }
}
