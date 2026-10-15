import { parseIncomingOrder } from "@/lib/server-orders";

/** Only pricing/selection/customer contact come from the browser; workflow state is server-owned. */
export function parsePublicCheckout(input: unknown, now = new Date()) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Pedido inválido.");
  const raw = input as Record<string, unknown>;
  if (!["own_delivery", "pickup", "table_qr"].includes(String(raw.channel))) throw new Error("Canal não permitido no checkout público.");
  const table = raw.channel === "table_qr";
  return parseIncomingOrder({ ...raw, number: 1, status: "received", paymentStatus: "pending",
    createdAt: now.toISOString(), updatedAt: now.toISOString(), origin: table ? "table" : "web",
    customerId: undefined, externalId: undefined, trackingToken: undefined, driverId: undefined,
    tabId: table ? raw.tabId : undefined, tableNumber: table ? raw.tableNumber : undefined,
    tabName: table ? raw.tabName : undefined,
  });
}
