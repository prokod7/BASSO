import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

const createSchema = z.object({
  key: z.string().regex(/^[a-z0-9_]{2,60}$/),
  name: z.string().min(2).max(120),
  channel: z.enum(["manual_whatsapp", "push", "email"]).default("manual_whatsapp"),
  body: z.string().min(1).max(2000),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(10000).default(100),
});

export async function GET() {
  try {
    await requireOperationalRole(["manager", "counter", "waiter", "finance", "viewer"], "orders.view");
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { data, error } = await db.from("communication_templates").select("key,name,channel,body,active,sort_order,updated_at").order("sort_order").order("name");
    if (error) throw error;
    return NextResponse.json({ templates: (data || []).map((row: Record<string, unknown>) => ({
      key: String(row.key), name: String(row.name), channel: String(row.channel), body: String(row.body),
      active: Boolean(row.active), sortOrder: Number(row.sort_order || 0), updatedAt: String(row.updated_at),
    })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao consultar mensagens." }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOperationalRole(["manager"], "settings.manage");
    const body = createSchema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const payload = { key: body.key, name: body.name.trim(), channel: body.channel, body: body.body.trim(), active: body.active, sort_order: body.sortOrder, updated_by: auth.userId === "demo" ? null : auth.userId, updated_at: new Date().toISOString() };
    const { data, error } = await db.from("communication_templates").insert(payload).select("key").single();
    if (error) throw error;
    await db.from("audit_logs").insert({ actor_id: auth.userId === "demo" ? null : auth.userId, actor_label: auth.displayName, action: "COMMUNICATION_TEMPLATE_CREATED", entity_type: "communication_template", entity_id: data.key, after_data: payload });
    return NextResponse.json({ saved: true, key: data.key }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao criar mensagem." }, { status: 400 });
  }
}
