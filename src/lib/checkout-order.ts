import { createHash, randomBytes } from "crypto";
import { loadBusinessSettings } from "@/lib/business-settings";
import { storeStatus } from "@/lib/opening-hours";
import { parseIncomingOrder } from "@/lib/server-orders";
import type { CommercialQuote } from "@/lib/server-quote";
import type { Order } from "@/types";

/**
 * Situação da loja para novos pedidos (site e WhatsApp). Sem controle manual, segue o
 * horário de funcionamento e sincroniza store_runtime_status.
 */
export async function storeAcceptance(db: any): Promise<{ accepting: boolean; status: string; message: string }> {
  const { data: runtime, error } = await db
    .from("store_runtime_status")
    .select("operational_status,accepting_orders,pause_reason,manual_override")
    .eq("id", true)
    .maybeSingle();
  if (error) throw error;
  let status = runtime?.operational_status || "closed";
  let accepting = Boolean(runtime?.accepting_orders);
  if (runtime && runtime.manual_override === false) {
    const business = await loadBusinessSettings(db);
    const schedule = storeStatus(new Date(), business.openingHours);
    status = schedule.open ? "open" : "closed";
    accepting = schedule.open;
    if (runtime.operational_status !== status || runtime.accepting_orders !== accepting) {
      await db
        .from("store_runtime_status")
        .update({ operational_status: status, accepting_orders: accepting, pause_reason: null, temporary_until: null, updated_at: new Date().toISOString() })
        .eq("id", true);
    }
  }
  const message = accepting ? "" : status === "paused" ? runtime?.pause_reason || "Pedidos temporariamente pausados." : "A loja está fechada no momento.";
  return { accepting, status, message };
}

/**
 * Grava um pedido já cotado pelo servidor: transação do pedido (idempotente pela chave),
 * token de acompanhamento e fila de impressão. Mesma rotina do checkout do site.
 */
export async function createQuotedOrder(db: any, supplied: Order, quote: CommercialQuote) {
  const order = parseIncomingOrder({
    ...supplied,
    items: quote.items,
    subtotal: quote.subtotal,
    discount: quote.discount,
    deliveryFee: quote.deliveryFee,
    total: quote.total,
    couponCode: quote.couponCode,
  });
  const { data: transaction, error } = await db.rpc("create_order_transaction", { p_order: order });
  if (error) throw error;
  const id = String(transaction?.id || order.id);
  const duplicate = Boolean(transaction?.duplicate);
  let accessToken: string | undefined;
  if (!duplicate) {
    accessToken = randomBytes(24).toString("base64url");
    const tokenHash = createHash("sha256").update(accessToken).digest("hex");
    const { error: accessError } = await db.from("order_access_tokens").insert({ order_id: id, token_hash: tokenHash });
    if (accessError) throw accessError;
    await db.rpc("enqueue_order_print_jobs", { p_order_id: id });
  }
  const { data: created, error: createdError } = await db.from("orders").select("daily_number,number,status,tab_id").eq("id", id).single();
  if (createdError) throw createdError;
  return { id, number: Number(created.daily_number ?? created.number), status: created.status as string, tabId: (created.tab_id as string | null) || undefined, accessToken, duplicate };
}
