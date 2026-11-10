import { apiErrorMessage } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { priceItemsWithRuntime } from "@/lib/server-menu-pricing";
import type { CartItem, OrderChannel } from "@/types";

const itemSchema = z.object({
  id: z.string().min(4).max(120),
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
    if (order.status === "cancelled") throw new Error("Pedido cancelado não pode ser alterado.");
    const item: CartItem = supplied as CartItem;
    const priced = await priceItemsWithRuntime(db, [item], order.channel as OrderChannel, false);
    const normalized = priced.items[0];
    const { data: totals, error } = await db.rpc("add_order_item_transaction", {
      p_order_id: orderId, p_item: normalized,
      p_actor_id: auth.userId === "demo" ? null : auth.userId,
    });
    if (error) throw error;
    return NextResponse.json({ item: normalized, totals }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: apiErrorMessage(error, "Falha ao adicionar item.") }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const body = patchSchema.parse(await request.json());
    const productionOnly = body.action === "production_status" && body.status !== "cancelled";
    const auth = await requireOperationalRole(productionOnly ? ["manager", "counter", "waiter", "kitchen", "bar"] : ["manager", "counter", "waiter"], productionOnly ? "kds.manage" : "orders.edit");
    const { id: orderId } = await params;
    const itemId = request.nextUrl.searchParams.get("itemId");
    if (!itemId) throw new Error("Item não informado.");
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
    return NextResponse.json({ error: apiErrorMessage(error, "Falha ao alterar item.") }, { status: 400 });
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

