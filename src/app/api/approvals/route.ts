import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapApproval } from "@/lib/admin-control";

const createSchema = z.object({
  actionType: z.string().min(2).max(120),
  entityType: z.string().min(2).max(80),
  entityId: z.string().min(1).max(160),
  reason: z.string().min(2).max(1000),
  requestedPayload: z.record(z.unknown()).default({}),
  expiresAt: z.string().datetime().nullable().optional(),
});

export async function GET(request: NextRequest) {
  try {
    await requireOperationalRole(["manager", "counter", "waiter", "finance", "viewer"], "orders.view");
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const status = request.nextUrl.searchParams.get("status");
    let query = db.from("approval_requests").select("*").order("requested_at", { ascending: false }).limit(300);
    if (status && status !== "all") query = query.eq("status", status);
    const { data, error } = await query;
    if (error) throw error;
    const profileIds = [...new Set((data || []).flatMap((row: { requested_by?: string | null; reviewed_by?: string | null }) => [row.requested_by, row.reviewed_by].filter((value): value is string => Boolean(value))))];
    const profiles = profileIds.length ? await db.from("profiles").select("id,display_name").in("id", profileIds) : { data: [], error: null };
    if (profiles.error) throw profiles.error;
    const names = new Map((profiles.data || []).map((profile: { id: string; display_name: string }) => [profile.id, profile.display_name]));
    return NextResponse.json({ approvals: (data || []).map((raw: Record<string, unknown>) => mapApproval({
      ...raw,
      requester: raw.requested_by ? { display_name: names.get(String(raw.requested_by)) } : null,
      reviewer: raw.reviewed_by ? { display_name: names.get(String(raw.reviewed_by)) } : null,
    })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao consultar aprovações." }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOperationalRole(["manager", "counter", "waiter", "finance"], "orders.edit");
    const body = createSchema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const payload = {
      action_type: body.actionType,
      entity_type: body.entityType,
      entity_id: body.entityId,
      reason: body.reason.trim(),
      requested_payload: body.requestedPayload,
      requested_by: auth.userId === "demo" ? null : auth.userId,
      expires_at: body.expiresAt || null,
    };
    const { data, error } = await db.from("approval_requests").insert(payload).select("*").single();
    if (error) throw error;
    await db.from("internal_notifications").insert({ audience_role: "manager", category: "approval", priority: "high", title: "Nova aprovação pendente", body: `${auth.displayName} solicitou ${body.actionType}: ${body.reason.trim()}`, href: "/painel/aprovacoes", metadata: { approvalId: data.id, entityType: body.entityType, entityId: body.entityId } });
    await db.from("audit_logs").insert({ actor_id: auth.userId === "demo" ? null : auth.userId, actor_label: auth.displayName, action: "APPROVAL_REQUESTED", entity_type: "approval_request", entity_id: data.id, reason: body.reason, after_data: payload });
    return NextResponse.json({ approval: mapApproval(data as Record<string, unknown>) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao solicitar aprovação." }, { status: 400 });
  }
}
