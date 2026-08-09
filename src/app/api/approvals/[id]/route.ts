import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ decision: z.enum(["approved", "rejected", "cancelled"]), reviewNote: z.string().max(1000).optional() });

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireOperationalRole(["manager"], "users.manage");
    const { id } = await context.params;
    const body = schema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { error } = await db.rpc("resolve_approval_request", { p_id: id, p_decision: body.decision, p_review_note: body.reviewNote || null, p_actor_id: auth.userId === "demo" ? null : auth.userId });
    if (error) throw error;
    const { data: approval } = await db.from("approval_requests").select("requested_by,action_type,entity_type,entity_id").eq("id", id).maybeSingle();
    if (approval?.requested_by) {
      await db.from("internal_notifications").insert({ recipient_id: approval.requested_by, category: "approval", priority: body.decision === "approved" ? "normal" : "high", title: body.decision === "approved" ? "Solicitação aprovada" : "Solicitação rejeitada", body: body.reviewNote || `${approval.action_type} • ${approval.entity_type} ${approval.entity_id}`, href: "/painel/aprovacoes", metadata: { approvalId: id, decision: body.decision } });
    }
    return NextResponse.json({ updated: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao processar aprovação." }, { status: 400 });
  }
}
