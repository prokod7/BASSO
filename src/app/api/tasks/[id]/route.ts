import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  status: z.enum(["open", "in_progress", "blocked", "completed", "cancelled"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  title: z.string().min(2).max(180).optional(),
  description: z.string().max(3000).optional(),
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireOperationalRole(["manager", "counter", "waiter", "kitchen", "bar", "driver", "finance"], "orders.edit");
    const { id } = await context.params;
    const body = schema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { data: current, error: currentError } = await db.from("operation_tasks").select("*").eq("id", id).single();
    if (currentError) throw currentError;
    if (!["manager", "counter"].includes(auth.role) && current.assigned_to !== auth.userId && current.created_by !== auth.userId) {
      throw new Error("Você só pode alterar tarefas atribuídas a você ou criadas por você.");
    }
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.status !== undefined) {
      patch.status = body.status;
      patch.completed_at = body.status === "completed" ? new Date().toISOString() : null;
      patch.completed_by = body.status === "completed" && auth.userId !== "demo" ? auth.userId : null;
    }
    if (body.priority !== undefined) patch.priority = body.priority;
    if (body.assignedTo !== undefined) patch.assigned_to = body.assignedTo;
    if (body.dueAt !== undefined) patch.due_at = body.dueAt;
    if (body.title !== undefined) patch.title = body.title.trim();
    if (body.description !== undefined) patch.description = body.description.trim();
    const { error } = await db.from("operation_tasks").update(patch).eq("id", id);
    if (error) throw error;
    await db.from("audit_logs").insert({ actor_id: auth.userId === "demo" ? null : auth.userId, actor_label: auth.displayName, action: "OPERATION_TASK_UPDATED", entity_type: "operation_task", entity_id: id, before_data: current, after_data: patch });
    return NextResponse.json({ updated: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao atualizar tarefa." }, { status: 400 });
  }
}
