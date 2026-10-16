import { apiErrorMessage } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOperationalRole } from "@/lib/authz";
import { assertOrderTransition } from "@/lib/operational-state";
import { IfoodAdapter } from "@/lib/integrations/ifood";
import type { OrderChannel, OrderStatus } from "@/types";

const schema = z.object({
  status: z.enum(["received", "confirmed", "preparing", "ready", "out_for_delivery", "completed", "cancelled"]),
  reason: z.string().max(500).optional(),
  cancellationCode: z.string().max(80).optional(),
  expectedVersion: z.number().int().positive().optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireOperationalRole(["manager", "counter", "waiter", "kitchen", "bar", "driver", "finance"], "orders.edit");
    const { id } = await params;
    const body = schema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });

    const { data: order, error: readError } = await db
      .from("orders")
      .select("id,channel,status,external_id,external_payload,version,payment_status")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (readError) throw readError;

    if (body.expectedVersion && Number(order.version || 1) !== body.expectedVersion) {
      return NextResponse.json({
        error: "Este pedido foi alterado em outro dispositivo. Atualize a comanda antes de continuar.",
        code: "ORDER_VERSION_CONFLICT",
        currentVersion: Number(order.version || 1),
      }, { status: 409 });
    }

    // No delivery próprio, o motoboy não pode contornar a validação de retirada
    // nem concluir sem o código que está somente com o cliente. Gestor/balcão
    // continuam com capacidade de contingência administrativa auditada.
    if (order.channel === "own_delivery" && auth.role === "driver" && body.status === "out_for_delivery") {
      throw new Error("Valide a retirada pelo QR Code ou código de 6 dígitos da comanda.");
    }
    if (order.channel === "own_delivery" && auth.role === "driver" && body.status === "completed") {
      throw new Error("Informe o código de confirmação do cliente para concluir a entrega.");
    }

    if (body.status === "cancelled" && auth.role !== "manager" && auth.permissions["orders.cancel"] !== true) {
      throw new Error("Seu usuário não possui autorização para cancelar pedidos.");
    }

    assertOrderTransition({
      current: order.status as OrderStatus,
      target: body.status as OrderStatus,
      channel: order.channel as OrderChannel,
      role: auth.role,
      reason: body.reason,
    });

    // Concluir a operação não altera o financeiro: pedidos pendentes continuam pendentes
    // até o recebimento ser registrado na aba Pagamento.

    if (order.channel === "ifood" && order.external_id) {
      const ifood = new IfoodAdapter();
      if (body.status === "cancelled") {
        if (!body.cancellationCode) throw new Error("Selecione um motivo de cancelamento fornecido pelo iFood.");
        await ifood.cancelOrder(order.external_id, body.reason || "Cancelado pela operação", body.cancellationCode);
      } else {
        await ifood.updateStatus(order.external_id, body.status as OrderStatus);
      }
    }

    const { error } = await db.rpc("change_order_status_controlled", {
      p_order_id: id,
      p_expected_version: body.expectedVersion ?? Number(order.version || 1),
      p_status: body.status,
      p_reason: body.reason || null,
      p_actor_id: auth.userId === "demo" ? null : auth.userId,
    });
    if (error) throw error;

    if (order.channel === "99food" && order.external_id) {
      await db.from("integration_events").insert({
        provider: order.channel,
        event_id: `${id}:${body.status}:${Date.now()}`,
        event_type: body.status === "cancelled" ? "ORDER_CANCELLED" : "ORDER_STATUS_UPDATE",
        direction: "outgoing",
        payload: { externalId: order.external_id, status: body.status, reason: body.reason || null, cancellationCode: body.cancellationCode || null },
        status: "pending",
      });
    }

    const { data: updated } = await db.from("orders").select("version,status").eq("id", id).single();
    return NextResponse.json({ id, status: body.status, version: Number(updated?.version || Number(order.version || 1) + 1) });
  } catch (error) {
    return NextResponse.json({ error: apiErrorMessage(error, "Falha ao atualizar status.") }, { status: apiErrorMessage(error, "").includes("ORDER_VERSION_CONFLICT") ? 409 : 400 });
  }
}

