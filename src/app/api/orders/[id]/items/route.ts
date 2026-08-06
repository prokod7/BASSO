import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { priceItemsWithRuntime } from "@/lib/server-menu-pricing";
import type { CartItem, OrderChannel } from "@/types";

const itemSchema = z.object({
  id: z.string().min(4).max(120).optional(),
  kind: z.enum(["pizza", "product", "combo", "reward"]),
  name: z.string().min(1).max(240),
  quantity: z.number().int().min(1).max(99),
  unitPrice: z.number().int().nonnegative(),
  productId: z.string().optional(),
  selection: z.any().optional(),
});

const patchSchema = z.object({
  action: z.enum(["quantity", "notes", "cancel", "restore", "production_status"]),
  quantity: z.number().int().min(1).max(99).optional(),
  notes: z.string().max(500).optional(),
  status: z.enum(["queued", "preparing", "ready", "cancelled"]).optional(),
  reason: z.string().max(500).optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireOperationalRole(["manager", "counter", "waiter"], "orders.edit");
    const { id: orderId } = await params;
    const supplied = itemSchema.parse(await request.json());
    if (supplied.kind === "reward") throw new Error("Recompensas devem ser lançadas pelo fluxo de fidelidade autorizado.");
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { data: order, error: orderError } = await db.from("orders").select("id,channel,status").eq("id", orderId).single();
    if (orderError) throw orderError;
    if (["completed", "cancelled"].includes(order.status)) throw new Error("Não é possível adicionar itens a um pedido encerrado.");
    const item: CartItem = { ...supplied, id: supplied.id || `item_${randomUUID()}` } as CartItem;
    const priced = await priceItemsWithRuntime(db, [item], order.channel as OrderChannel, false);
    const normalized = priced.items[0];
    const { error } = await db.from("order_items").insert({
      id: normalized.id,
      order_id: orderId,
      kind: normalized.kind,
      name_snapshot: normalized.name,
      quantity: normalized.quantity,
      unit_price_cents: normalized.unitPrice,
      product_id: normalized.productId || null,
      selection: normalized.selection || null,
      sector: normalized.kind === "product" ? "bar" : "kitchen",
      production_status: "queued",
      updated_by: auth.userId === "demo" ? null : auth.userId,
    });
    if (error) throw error;
    const { data: totals, error: totalError } = await db.rpc("recalculate_order_totals", { p_order_id: orderId });
    if (totalError) throw totalError;
    await db.from("audit_logs").insert({ actor_id: auth.userId === "demo" ? null : auth.userId, actor_label: auth.displayName, action: "ORDER_ITEM_ADDED", entity_type: "order_item", entity_id: normalized.id, reason: "Item incluído pela operação", after_data: normalized });
    await db.rpc("enqueue_order_print_jobs", { p_order_id: orderId });
    return NextResponse.json({ item: normalized, totals }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao adicionar item." }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireOperationalRole(["manager", "counter", "waiter", "kitchen", "bar"], "orders.edit");
    const { id: orderId } = await params;
    const itemId = request.nextUrl.searchParams.get("itemId");
    if (!itemId) throw new Error("Item não informado.");
    const body = patchSchema.parse(await request.json());
    if (["quantity", "cancel", "restore"].includes(body.action) && !body.reason?.trim()) throw new Error("Informe o motivo da alteração.");
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const value = body.action === "quantity" ? { quantity: body.quantity } : body.action === "notes" ? { notes: body.notes || "" } : body.action === "production_status" ? { status: body.status } : {};
    const { data, error } = await db.rpc("manage_order_item_transaction", {
      p_order_id: orderId,
      p_item_id: itemId,
      p_action: body.action,
      p_value: value,
      p_reason: body.reason || null,
      p_actor_id: auth.userId === "demo" ? null : auth.userId,
    });
    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao alterar item." }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const url = new URL(request.url);
  const reason = url.searchParams.get("reason") || "Item cancelado pela operação";
  const forwarded = new NextRequest(request.url, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: request.headers.get("cookie") || "" },
    body: JSON.stringify({ action: "cancel", reason }),
  });
  return PATCH(forwarded, context);
}
