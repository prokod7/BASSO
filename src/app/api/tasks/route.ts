import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapOperationTask } from "@/lib/admin-control";

const createSchema = z.object({
  title: z.string().min(2).max(180),
  description: z.string().max(3000).default(""),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  assignedTo: z.string().uuid().nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  sourceType: z.string().max(80).nullable().optional(),
  sourceId: z.string().max(160).nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function GET(request: NextRequest) {
  try {
    await requireOperationalRole(["manager", "counter", "waiter", "kitchen", "bar", "driver", "finance", "viewer"], "orders.view");
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const status = request.nextUrl.searchParams.get("status");
    const assignedTo = request.nextUrl.searchParams.get("assignedTo");
    let query = db.from("operation_tasks").select("*").order("created_at", { ascending: false }).limit(300);
    if (status && status !== "all") query = query.eq("status", status);
    if (assignedTo) query = query.eq("assigned_to", assignedTo);
    const { data, error } = await query;
    if (error) throw error;
    const profileIds = [...new Set((data || []).flatMap((row: { assigned_to?: string | null; created_by?: string | null }) => [row.assigned_to, row.created_by].filter((value): value is string => Boolean(value))))];
    const profiles = profileIds.length ? await db.from("profiles").select("id,display_name").in("id", profileIds) : { data: [], error: null };
    if (profiles.error) throw profiles.error;
    const names = new Map((profiles.data || []).map((profile: { id: string; display_name: string }) => [profile.id, profile.display_name]));
    const tasks = (data || []).map((raw: Record<string, unknown>) => mapOperationTask({
      ...raw,
      assignee: raw.assigned_to ? { display_name: names.get(String(raw.assigned_to)) } : null,
      creator: raw.created_by ? { display_name: names.get(String(raw.created_by)) } : null,
    }));
    return NextResponse.json({ tasks }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao consultar tarefas." }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOperationalRole(["manager", "counter", "waiter", "kitchen", "bar", "finance"], "orders.edit");
    const body = createSchema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const payload = {
      title: body.title.trim(),
      description: body.description.trim(),
      priority: body.priority,
      assigned_to: body.assignedTo || null,
      due_at: body.dueAt || null,
      source_type: body.sourceType || null,
      source_id: body.sourceId || null,
      metadata: body.metadata || {},
      created_by: auth.userId === "demo" ? null : auth.userId,
    };
    const { data, error } = await db.from("operation_tasks").insert(payload).select("*").single();
    if (error) throw error;
    await db.from("audit_logs").insert({ actor_id: auth.userId === "demo" ? null : auth.userId, actor_label: auth.displayName, action: "OPERATION_TASK_CREATED", entity_type: "operation_task", entity_id: data.id, after_data: payload });
    if (body.assignedTo) {
      await db.from("internal_notifications").insert({ recipient_id: body.assignedTo, category: "task", priority: body.priority, title: `Nova tarefa: ${body.title.trim()}`, body: body.description.trim(), href: "/painel/tarefas", metadata: { taskId: data.id } });
    }
    return NextResponse.json({ task: mapOperationTask(data as Record<string, unknown>) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao criar tarefa." }, { status: 400 });
  }
}
