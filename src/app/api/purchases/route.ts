import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapPurchaseOrder, mapSupplier } from "@/lib/admin-control";
import type { PurchaseOrderItemRecord } from "@/types";

const supplierSchema = z.object({
  action: z.literal("create_supplier"),
  name: z.string().min(2).max(180),
  document: z.string().max(40).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  email: z.string().email().max(180).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

const orderSchema = z.object({
  action: z.literal("create_order"),
  supplierId: z.string().uuid().nullable().optional(),
  expectedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a data no formato AAAA-MM-DD").nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  items: z.array(z.object({
    productId: z.string().min(1),
    quantity: z.number().positive(),
    unitCost: z.number().int().nonnegative(),
    expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a data no formato AAAA-MM-DD").nullable().optional(),
  })).min(1).max(100),
});

const schema = z.discriminatedUnion("action", [supplierSchema, orderSchema]);

export async function GET() {
  try {
    await requireOperationalRole(["manager", "counter", "finance", "viewer"], "inventory.manage");
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });

    const [suppliersResult, productsResult, ordersResult, itemsResult] = await Promise.all([
      db.from("suppliers").select("*").order("name"),
      db.from("products").select("id,name,category,active,inventory_items(id,quantity,minimum_quantity,unit)").eq("stock_tracked", true).order("name"),
      db.from("purchase_orders").select("*,supplier:suppliers(name)").order("created_at", { ascending: false }).limit(200),
      db.from("purchase_order_items").select("*,product:products(name)").order("id"),
    ]);
    if (suppliersResult.error) throw suppliersResult.error;
    if (productsResult.error) throw productsResult.error;
    if (ordersResult.error) throw ordersResult.error;
    if (itemsResult.error) throw itemsResult.error;

    const itemsByOrder = new Map<string, PurchaseOrderItemRecord[]>();
    for (const raw of itemsResult.data || []) {
      const row = raw as Record<string, unknown>;
      const product = row.product as { name?: string } | null | undefined;
      const item: PurchaseOrderItemRecord = {
        id: String(row.id),
        productId: String(row.product_id),
        productName: product?.name || String(row.product_id),
        orderedQuantity: Number(row.ordered_quantity || 0),
        receivedQuantity: Number(row.received_quantity || 0),
        unitCost: Number(row.unit_cost_cents || 0),
        expiresAt: typeof row.expires_at === "string" ? row.expires_at : undefined,
      };
      const orderId = String(row.purchase_order_id);
      itemsByOrder.set(orderId, [...(itemsByOrder.get(orderId) || []), item]);
    }

    return NextResponse.json({
      suppliers: (suppliersResult.data || []).map((row: Record<string, unknown>) => mapSupplier(row)),
      products: (productsResult.data || []).map((raw: Record<string, unknown>) => {
        const inventory = Array.isArray(raw.inventory_items)
          ? raw.inventory_items[0] as Record<string, unknown> | undefined
          : raw.inventory_items && typeof raw.inventory_items === "object"
            ? raw.inventory_items as Record<string, unknown>
            : undefined;
        return {
          id: String(raw.id),
          name: String(raw.name),
          category: String(raw.category),
          active: Boolean(raw.active),
          inventoryId: inventory ? String(inventory.id) : undefined,
          quantity: Number(inventory?.quantity || 0),
          minimumQuantity: Number(inventory?.minimum_quantity || 0),
          unit: String(inventory?.unit || "unidade"),
        };
      }),
      orders: (ordersResult.data || []).map((row: Record<string, unknown>) => mapPurchaseOrder(row, itemsByOrder.get(String(row.id)) || [])),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao consultar compras." }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOperationalRole(["manager", "counter", "finance"], "inventory.manage");
    const body = schema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const actorId = auth.userId === "demo" ? null : auth.userId;

    if (body.action === "create_supplier") {
      const payload = {
        name: body.name.trim(),
        document: body.document?.trim() || null,
        phone: body.phone?.trim() || null,
        email: body.email?.trim() || null,
        notes: body.notes?.trim() || null,
      };
      const { data, error } = await db.from("suppliers").insert(payload).select("*").single();
      if (error) throw error;
      await db.from("audit_logs").insert({ actor_id: actorId, actor_label: auth.displayName, action: "SUPPLIER_CREATED", entity_type: "supplier", entity_id: data.id, after_data: payload });
      return NextResponse.json({ supplier: mapSupplier(data as Record<string, unknown>) }, { status: 201 });
    }

    const duplicateProducts = new Set<string>();
    for (const item of body.items) {
      if (duplicateProducts.has(item.productId)) throw new Error("O mesmo produto não pode aparecer duas vezes no pedido de compra.");
      duplicateProducts.add(item.productId);
    }
    type PurchaseInputItem = (typeof body.items)[number];
    const total = body.items.reduce((sum: number, item: PurchaseInputItem) => sum + item.quantity * item.unitCost, 0);
    const orderPayload = {
      supplier_id: body.supplierId || null,
      status: "draft",
      expected_at: body.expectedAt || null,
      total_cents: Math.round(total),
      notes: body.notes?.trim() || null,
      created_by: actorId,
    };
    const { data: order, error: orderError } = await db.from("purchase_orders").insert(orderPayload).select("*").single();
    if (orderError) throw orderError;
    const itemsPayload = body.items.map((item: PurchaseInputItem) => ({
      purchase_order_id: order.id,
      product_id: item.productId,
      ordered_quantity: item.quantity,
      unit_cost_cents: item.unitCost,
      expires_at: item.expiresAt || null,
    }));
    const { error: itemsError } = await db.from("purchase_order_items").insert(itemsPayload);
    if (itemsError) {
      await db.from("purchase_orders").delete().eq("id", order.id);
      throw itemsError;
    }
    await db.from("audit_logs").insert({ actor_id: actorId, actor_label: auth.displayName, action: "PURCHASE_ORDER_CREATED", entity_type: "purchase_order", entity_id: order.id, after_data: { ...orderPayload, items: itemsPayload } });
    return NextResponse.json({ id: order.id, number: order.number }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao cadastrar compra." }, { status: 400 });
  }
}
