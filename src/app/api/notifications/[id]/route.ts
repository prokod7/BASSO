import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ action: z.enum(["read", "unread", "dismiss"]) });

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireOperationalRole(["manager", "counter", "waiter", "kitchen", "bar", "driver", "finance", "viewer"]);
    const { id } = await context.params;
    const body = schema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { data: current, error: currentError } = await db.from("internal_notifications").select("recipient_id,audience_role").eq("id", id).single();
    if (currentError) throw currentError;
    if (current.recipient_id && current.recipient_id !== auth.userId && auth.role !== "manager") throw new Error("Notificação não pertence ao usuário.");
    const patch = body.action === "read" ? { read_at: new Date().toISOString() } : body.action === "unread" ? { read_at: null } : { dismissed_at: new Date().toISOString() };
    const { error } = await db.from("internal_notifications").update(patch).eq("id", id);
    if (error) throw error;
    return NextResponse.json({ updated: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao atualizar notificação." }, { status: 400 });
  }
}
