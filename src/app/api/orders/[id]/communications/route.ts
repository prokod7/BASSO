import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  templateKey: z.string().min(1).max(80),
  message: z.string().min(1).max(2000),
  recipient: z.string().max(40),
  status: z.enum(["opened", "sent", "failed", "cancelled"]).default("opened"),
});

export async function GET() {
  try {
    await requireOperationalRole(["manager", "counter", "waiter", "finance", "viewer"], "orders.view");
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { data, error } = await db.from("communication_templates").select("key,name,body,active,sort_order").eq("active", true).order("sort_order");
    if (error) throw error;
    return NextResponse.json({ templates: (data || []).map((row: { key: string; name: string; body: string; active: boolean; sort_order: number }) => ({ key: row.key, name: row.name, body: row.body, active: row.active, sortOrder: row.sort_order })) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao carregar mensagens." }, { status: 400 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireOperationalRole(["manager", "counter", "waiter"], "orders.edit");
    const { id } = await params;
    const body = schema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { data, error } = await db.from("order_communication_logs").insert({
      order_id: id,
      channel: "manual_whatsapp",
      template_key: body.templateKey,
      recipient: body.recipient,
      message_snapshot: body.message,
      status: body.status,
      created_by: auth.userId === "demo" ? null : auth.userId,
      created_by_label: auth.displayName,
    }).select("id").single();
    if (error) throw error;
    await db.from("audit_logs").insert({ actor_id: auth.userId === "demo" ? null : auth.userId, actor_label: auth.displayName, action: "ORDER_WHATSAPP_OPENED", entity_type: "order", entity_id: id, after_data: { templateKey: body.templateKey, recipient: body.recipient } });
    return NextResponse.json({ id: data.id, logged: true }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao registrar comunicação." }, { status: 400 });
  }
}
