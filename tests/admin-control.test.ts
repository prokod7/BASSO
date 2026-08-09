import { describe, expect, it } from "vitest";
import { buildDemoControlCenter, mapPurchaseOrder, mapStoreRuntime } from "@/lib/admin-control";

 describe("Mega Update 04 - autonomia administrativa", () => {
  it("mapeia o estado completo da loja", () => {
    const status = mapStoreRuntime({
      operational_status: "paused",
      accepting_orders: false,
      pause_reason: "Pico de produção",
      manual_override: true,
      active_channels: ["pickup", "dine_in"],
      preparation_minutes: 55,
      delivery_minutes: 80,
      updated_at: "2026-08-06T03:00:00.000Z",
    });
    expect(status.operationalStatus).toBe("paused");
    expect(status.activeChannels).toEqual(["pickup", "dine_in"]);
    expect(status.preparationMinutes).toBe(55);
  });

  it("gera um centro de comando demonstrativo coerente", () => {
    const snapshot = buildDemoControlCenter();
    expect(snapshot.store.acceptingOrders).toBe(true);
    expect(snapshot.orders.active).toBeGreaterThan(0);
    expect(snapshot.cash.open).toBe(true);
  });

  it("preserva itens de um pedido de compra", () => {
    const purchase = mapPurchaseOrder({
      id: "purchase-1",
      number: 18,
      status: "ordered",
      total_cents: 12500,
      created_at: "2026-08-06T03:00:00.000Z",
      updated_at: "2026-08-06T03:00:00.000Z",
      supplier: { name: "Distribuidora" },
    }, [{ id: "item-1", productId: "coke", productName: "Coca-Cola 2 L", orderedQuantity: 10, receivedQuantity: 0, unitCost: 1250 }]);
    expect(purchase.supplierName).toBe("Distribuidora");
    expect(purchase.items).toHaveLength(1);
    expect(purchase.total).toBe(12500);
  });
});
