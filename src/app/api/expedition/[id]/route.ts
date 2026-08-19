import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

const checklistSchema = z.object({
  items: z.boolean().optional(),
  beverages: z.boolean().optional(),
  payment: z.boolean().optional(),
  address: z.boolean().optional(),
  customer: z.boolean().optional(),
}).strict();

const statusSchema = z.object({
  action: z.literal("status").optional(),
  status: z.enum(["pending", "checking", "approved", "returned"]),
  notes: z.string().max(1000).optional(),
  checklist: checklistSchema.default({}),
});

const checklistOnlySchema = z.object({
  action: z.literal("checklist"),
  checklist: checklistSchema,
});

const schema = z.union([statusSchema, checklistOnlySchema]);

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireOperationalRole(["manager", "counter", "kitchen", "bar"], "orders.edit");
    const { id } = await context.params;
    const body = schema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const actorId = auth.userId === "demo" ? null : auth.userId;

    if (body.action === "checklist") {
      const { error } = await db.rpc("save_order_expedition_checklist", {
        p_order_id: id,
        p_checklist: body.checklist,
        p_actor_id: actorId,
      });
      if (error) throw error;
      return NextResponse.json({ updated: true, kind: "checklist" });
    }

    if (body.status === "returned" && !body.notes?.trim()) {
      throw new Error("Informe o motivo da devolução para a produção.");
    }

    const { error } = await db.rpc("set_order_expedition_status_v2", {
      p_order_id: id,
      p_status: body.status,
      p_notes: body.notes?.trim() || null,
      p_checklist: body.checklist,
      p_actor_id: actorId,
    });
    if (error) throw error;

    if (body.status === "approved") {
      await db.from("internal_notifications").insert({
        audience_role: "counter",
        category: "expedition",
        priority: "normal",
        title: "Pedido liberado pela expedição",
        body: `O pedido ${id} foi conferido e está pronto para retirada ou despacho.`,
        href: `/painel/pedidos?order=${id}`,
        metadata: { orderId: id },
      });
    }
    return NextResponse.json({ updated: true, kind: "status" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao atualizar expedição." }, { status: 400 });
  }
}
