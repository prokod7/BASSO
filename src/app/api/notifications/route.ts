import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapInternalNotification } from "@/lib/admin-control";

const createSchema = z.object({
  recipientId: z.string().uuid().nullable().optional(),
  audienceRole: z.enum(["manager", "counter", "waiter", "kitchen", "bar", "driver", "finance", "viewer"]).nullable().optional(),
  category: z.string().min(2).max(80).default("operation"),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  title: z.string().min(2).max(180),
  body: z.string().max(2000).default(""),
  href: z.string().max(500).nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await requireOperationalRole(["manager", "counter", "waiter", "kitchen", "bar", "driver", "finance", "viewer"]);
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const includeRead = request.nextUrl.searchParams.get("includeRead") === "true";
    let query = db.from("internal_notifications").select("*").or(`recipient_id.eq.${auth.userId},recipient_id.is.null,audience_role.eq.${auth.role}`).is("dismissed_at", null).order("created_at", { ascending: false }).limit(100);
    if (!includeRead) query = query.is("read_at", null);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ notifications: (data || []).map((row: Record<string, unknown>) => mapInternalNotification(row)) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao consultar notificações." }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOperationalRole(["manager", "counter"], "settings.manage");
    const body = createSchema.parse(await request.json());
    if (!body.recipientId && !body.audienceRole && auth.role !== "manager") throw new Error("Selecione um destinatário ou perfil.");
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const payload = { recipient_id: body.recipientId || null, audience_role: body.audienceRole || null, category: body.category, priority: body.priority, title: body.title.trim(), body: body.body.trim(), href: body.href || null, metadata: body.metadata || {} };
    const { data, error } = await db.from("internal_notifications").insert(payload).select("*").single();
    if (error) throw error;
    await db.from("audit_logs").insert({ actor_id: auth.userId === "demo" ? null : auth.userId, actor_label: auth.displayName, action: "INTERNAL_NOTIFICATION_CREATED", entity_type: "internal_notification", entity_id: data.id, after_data: payload });
    return NextResponse.json({ notification: mapInternalNotification(data as Record<string, unknown>) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao criar notificação." }, { status: 400 });
  }
}
