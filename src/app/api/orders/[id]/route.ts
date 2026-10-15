import { apiErrorMessage } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  mapCommunication,
  mapIncident,
  mapManagedItem,
  mapNote,
  mapOrderRow,
  mapPayment,
  mapPrintJob,
  mapTimeline,
} from "@/lib/order-detail";

const addressSchema = z.object({
  cep: z.string().max(12), street: z.string().min(2).max(180), number: z.string().min(1).max(30), district: z.string().min(2).max(120),
  complement: z.string().max(160).optional(), reference: z.string().max(200).optional(), city: z.string().min(2).max(120), state: z.string().length(2),
  latitude: z.number().optional(), longitude: z.number().optional(),
});

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("update_order"), customerName: z.string().trim().min(2).max(120).optional(), customerPhone: z.string().max(20).optional(), address: addressSchema.nullable().optional(), notes: z.string().max(500).nullable().optional(), internalSummary: z.string().max(1000).nullable().optional(), priority: z.enum(["normal", "high", "urgent"]).optional(), estimatedReadyAt: z.string().datetime().nullable().optional(), discount: z.number().int().nonnegative().optional(), deliveryFee: z.number().int().nonnegative().optional(), reason: z.string().trim().min(2).max(500) }),
  z.object({ action: z.literal("mark_viewed") }),
  z.object({ action: z.literal("add_note"), body: z.string().trim().min(1).max(1000), pinned: z.boolean().default(false) }),
  z.object({ action: z.literal("add_incident"), category: z.enum(["customer", "address", "payment", "production", "delivery", "quality", "other"]), severity: z.enum(["low", "medium", "high", "critical"]), title: z.string().trim().min(2).max(160), description: z.string().max(2000).default("") }),
  z.object({ action: z.literal("resolve_incident"), incidentId: z.string().uuid(), resolution: z.string().trim().min(2).max(2000) }),
]);

async function loadDetail(db: NonNullable<ReturnType<typeof createAdminClient>>, id: string) {
  const [orderR, itemsR, historyR, paymentsR, notesR, incidentsR, communicationsR, printR, trackingR] = await Promise.all([
    db.from("orders").select("*").eq("id", id).is("deleted_at", null).single(),
    db.from("order_items").select("*").eq("order_id", id).order("created_at"),
    db.from("order_status_history").select("*").eq("order_id", id).order("created_at", { ascending: false }),
    db.from("payments").select("*").eq("order_id", id).order("created_at", { ascending: false }),
    db.from("order_internal_notes").select("*").eq("order_id", id).order("pinned", { ascending: false }).order("created_at", { ascending: false }),
    db.from("order_incidents").select("*").eq("order_id", id).order("created_at", { ascending: false }),
    db.from("order_communication_logs").select("*").eq("order_id", id).order("created_at", { ascending: false }),
    db.from("print_jobs").select("*").eq("order_id", id).order("created_at", { ascending: false }),
    db.from("tracking_tokens").select("token_value,expires_at,revoked_at,customer_visible").eq("order_id", id).maybeSingle(),
  ]);
  const failed = [orderR, itemsR, historyR, paymentsR, notesR, incidentsR, communicationsR, printR, trackingR].find(result => result.error);
  if (failed?.error) throw failed.error;
  const detail = mapOrderRow(orderR.data as Record<string, any>, (itemsR.data || []).map(mapManagedItem));
  detail.timeline = (historyR.data || []).map(mapTimeline);
  detail.payments = (paymentsR.data || []).map(mapPayment);
  detail.internalNotes = (notesR.data || []).map(mapNote);
  detail.incidents = (incidentsR.data || []).map(mapIncident);
  detail.communications = (communicationsR.data || []).map(mapCommunication);
  detail.printJobs = (printR.data || []).map(mapPrintJob);
  detail.paidAmount = detail.payments.filter(payment => payment.status === "paid").reduce((sum, payment) => sum + payment.amount, 0);
  detail.balanceDue = Math.max(0, detail.total - detail.paidAmount);
  const tracking = trackingR.data;
  if (tracking?.token_value && !tracking.revoked_at && tracking.customer_visible && new Date(tracking.expires_at).getTime() > Date.now()) {
    detail.trackingToken = tracking.token_value;
  }
  return detail;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireOperationalRole(["manager", "counter", "waiter", "kitchen", "bar", "driver", "finance", "viewer"], "orders.view");
    const { id } = await params;
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    return NextResponse.json({ order: await loadDetail(db, id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao carregar o pedido." }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireOperationalRole(["manager", "counter", "waiter", "kitchen", "bar", "finance"], "orders.edit");
    const { id } = await params;
    const body = patchSchema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const actorId = auth.userId === "demo" ? null : auth.userId;

    if (body.action === "mark_viewed") {
      const { error } = await db.from("orders").update({ viewed_at: new Date().toISOString(), updated_by: actorId }).eq("id", id);
      if (error) throw error;
    }

    if (body.action === "update_order") {
      const { data: before, error: readError } = await db.from("orders").select("*").eq("id", id).single();
      if (readError) throw readError;
      if (["ifood", "99food"].includes(before.channel) && (body.customerName || body.customerPhone || body.address !== undefined)) throw new Error("Dados pessoais de pedidos de marketplace não podem formar cadastro próprio nem ser alterados pelo CRM.");
      if ((body.discount !== undefined || body.deliveryFee !== undefined) && auth.role !== "manager") throw new Error("Somente o gestor pode alterar desconto ou taxa de entrega.");
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: actorId, version: Number(before.version || 1) + 1 };
      if (body.customerName !== undefined) patch.customer_name = body.customerName;
      if (body.customerPhone !== undefined) patch.customer_phone = body.customerPhone.replace(/\D/g, "");
      if (body.address !== undefined) patch.address = body.address;
      if (body.notes !== undefined) patch.notes = body.notes;
      if (body.internalSummary !== undefined) patch.internal_summary = body.internalSummary;
      if (body.priority !== undefined) patch.priority = body.priority;
      if (body.estimatedReadyAt !== undefined) patch.estimated_ready_at = body.estimatedReadyAt;
      if (body.discount !== undefined) patch.discount_cents = Math.min(Number(before.subtotal_cents), body.discount);
      if (body.deliveryFee !== undefined) patch.delivery_fee_cents = body.deliveryFee;
      if (body.discount !== undefined || body.deliveryFee !== undefined) {
        const discount = Number(patch.discount_cents ?? before.discount_cents);
        const fee = Number(patch.delivery_fee_cents ?? before.delivery_fee_cents);
        patch.total_cents = Math.max(0, Number(before.subtotal_cents) - discount + fee);
      }
      delete patch.version; delete patch.updated_at; delete patch.updated_by; delete patch.total_cents;
      const { error } = await db.rpc("update_order_transaction", {
        p_order_id: id, p_patch: patch, p_reason: body.reason, p_actor_id: actorId,
        p_expected_version: Number(before.version || 1),
      });
      if (error) throw error;
    }

    if (body.action === "add_note") {
      const { error } = await db.from("order_internal_notes").insert({ order_id: id, body: body.body, pinned: body.pinned, created_by: actorId, created_by_label: auth.displayName });
      if (error) throw error;
      await db.from("audit_logs").insert({ actor_id: actorId, actor_label: auth.displayName, action: "ORDER_NOTE_CREATED", entity_type: "order", entity_id: id, after_data: { pinned: body.pinned } });
    }

    if (body.action === "add_incident") {
      const { data, error } = await db.from("order_incidents").insert({ order_id: id, category: body.category, severity: body.severity, title: body.title, description: body.description, created_by: actorId }).select("id").single();
      if (error) throw error;
      await db.from("audit_logs").insert({ actor_id: actorId, actor_label: auth.displayName, action: "ORDER_INCIDENT_CREATED", entity_type: "order_incident", entity_id: data.id, after_data: body });
    }

    if (body.action === "resolve_incident") {
      const { data: before, error: readError } = await db.from("order_incidents").select("*").eq("id", body.incidentId).eq("order_id", id).single();
      if (readError) throw readError;
      const { error } = await db.from("order_incidents").update({ status: "resolved", resolution: body.resolution, resolved_by: actorId, resolved_at: new Date().toISOString() }).eq("id", body.incidentId);
      if (error) throw error;
      await db.from("audit_logs").insert({ actor_id: actorId, actor_label: auth.displayName, action: "ORDER_INCIDENT_RESOLVED", entity_type: "order_incident", entity_id: body.incidentId, reason: body.resolution, before_data: before });
    }

    return NextResponse.json({ order: await loadDetail(db, id) });
  } catch (error) {
    return NextResponse.json({ error: apiErrorMessage(error, "Falha ao atualizar o pedido.") }, { status: 400 });
  }
}

