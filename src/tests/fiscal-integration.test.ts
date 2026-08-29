import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { verifyFiscalAuthorization } from "@/lib/integrations/fiscal/auth";
import { handleFiscalOrdersRequest } from "@/lib/integrations/fiscal/handler";
import {
  mapFiscalPaymentMethod,
  mapFulfillment,
  mapOrderSource,
  paymentMethodsForFilter,
} from "@/lib/integrations/fiscal/mappings";
import {
  isFiscalEligibleOrder,
  mapFiscalOrder,
  type FiscalItemRow,
  type FiscalOrderRow,
  type FiscalPaymentRow,
} from "@/lib/integrations/fiscal/orders";
import {
  decodeFiscalCursor,
  encodeFiscalCursor,
  localDateStartUtc,
  parseFiscalQuery,
} from "@/lib/integrations/fiscal/schemas";

const SECRET = "fiscal-test-key-0123456789abcdef-0123456789abcdef";

const baseOrder: FiscalOrderRow = {
  id: "ord_real_001",
  number: 1051,
  channel: "own_delivery",
  status: "completed",
  payment_status: "paid",
  customer_name: "João",
  payment_method: "pix",
  subtotal_cents: 10790,
  discount_cents: 0,
  delivery_fee_cents: 800,
  total_cents: 11590,
  coupon_code: null,
  created_at: "2026-08-01T22:42:00.000Z",
  deleted_at: null,
  order_origin: "web",
};

const baseItem: FiscalItemRow = {
  id: "item_001",
  order_id: baseOrder.id,
  product_id: "produto_001",
  name_snapshot: "Produto",
  quantity: 1,
  unit_price_cents: 10790,
  selection: {},
  kind: "product",
  sector: "bar",
  production_status: "ready",
  created_at: "2026-08-01T22:42:00.000Z",
};

function params(query: string) {
  return parseFiscalQuery(new URLSearchParams(query));
}

describe("Basso Fiscal • API somente leitura", () => {
  it("1. sem Authorization retorna não autorizado quando a chave está configurada", () => {
    expect(verifyFiscalAuthorization(null, SECRET)).toBe("unauthorized");
  });

  it("2. Bearer incorreto retorna não autorizado", () => {
    expect(verifyFiscalAuthorization("Bearer segredo-errado", SECRET)).toBe("unauthorized");
    expect(verifyFiscalAuthorization("Basic abc", SECRET)).toBe("unauthorized");
  });

  it("3. Bearer correto permite resposta 200 pelo handler", async () => {
    const request = new NextRequest("https://basso.test/api/integrations/fiscal/orders", {
      headers: { authorization: `Bearer ${SECRET}` },
    });
    const response = await handleFiscalOrdersRequest(request, {
      apiKey: SECRET,
      createDb: () => ({} as any),
      fetchOrders: async () => ({ orders: [], pagination: { hasMore: false, nextCursor: null } }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("4. data inválida retorna erro de validação", () => {
    expect(() => params("start=2026-02-30")).toThrow("Período inválido.");
    expect(() => params("end=28/08/2026")).toThrow("Período inválido.");
  });

  it("5. start maior que end é rejeitado", () => {
    expect(() => params("start=2026-08-31&end=2026-08-01")).toThrow("Período inválido.");
  });

  it("6. filtro de um único dia cobre o dia local inteiro", () => {
    const parsed = params("start=2026-08-01&end=2026-08-01");
    expect(parsed.startUtc).toBe("2026-08-01T03:00:00.000Z");
    expect(parsed.endExclusiveUtc).toBe("2026-08-02T03:00:00.000Z");
  });

  it("7. período com vários dias termina na meia-noite local exclusiva do dia seguinte", () => {
    const parsed = params("start=2026-08-01&end=2026-08-31");
    expect(parsed.startUtc).toBe("2026-08-01T03:00:00.000Z");
    expect(parsed.endExclusiveUtc).toBe("2026-09-01T03:00:00.000Z");
  });

  it("8. America/Sao_Paulo respeita offset histórico e não fixa UTC-3", () => {
    expect(localDateStartUtc("2018-11-05")).toBe("2018-11-05T02:00:00.000Z");
  });

  it("9. payment=pix usa somente o método PIX real", () => {
    const parsed = params("payment=pix");
    expect(parsed.payment).toBe("pix");
    expect(paymentMethodsForFilter(parsed.payment!)).toEqual(["pix"]);
    expect(mapFiscalPaymentMethod("pix")).toBe("pix");
    expect(mapFiscalPaymentMethod("meal_voucher")).toBe("other");
  });

  it("10. source=cardapio representa web own_delivery/pickup", () => {
    expect(mapOrderSource("own_delivery", "web")).toBe("cardapio");
    expect(mapOrderSource("pickup", "web")).toBe("cardapio");
    expect(mapFulfillment("own_delivery")).toBe("delivery");
  });

  it("11. source=mesa representa table_qr / origem table", () => {
    expect(mapOrderSource("table_qr", "table")).toBe("mesa");
    expect(mapFulfillment("table_qr")).toBe("dine_in");
  });

  it("12. q numérico busca número e q textual busca ID exato", () => {
    expect(params("q=1051").qTarget).toEqual({ kind: "number", value: "1051" });
    expect(params("q=ord_real_001").qTarget).toEqual({ kind: "id", value: "ord_real_001" });
  });

  it("13. pedido com vários itens preserva todos os itens válidos", () => {
    const second: FiscalItemRow = { ...baseItem, id: "item_002", product_id: null, kind: "pizza", sector: "kitchen", name_snapshot: "Pizza Grande", unit_price_cents: 800 };
    const mapped = mapFiscalOrder(baseOrder, [baseItem, second], []);
    expect(mapped?.items).toHaveLength(2);
    expect(mapped?.items.map(item => item.id)).toEqual(["item_001", "item_002"]);
  });

  it("14. pizza meio a meio preserva selection sem reinterpretar", () => {
    const selection = {
      size: "grande",
      flavorA: "margherita",
      flavorB: "calabresa-tradicional",
      addons: { bacon: 1 },
      removedA: [],
      removedB: [],
    };
    const pizza: FiscalItemRow = { ...baseItem, kind: "pizza", sector: "kitchen", selection, name_snapshot: "Pizza Grande" };
    const mapped = mapFiscalOrder(baseOrder, [pizza], []);
    expect(mapped?.items[0].selection).toEqual(selection);
    expect(mapped?.items[0].selection).toBe(selection);
  });

  it("15. pedido cancelado nunca é elegível como venda fiscal", () => {
    expect(isFiscalEligibleOrder({ ...baseOrder, status: "cancelled" }, "all")).toBe(false);
  });

  it("16. pedido soft-deleted nunca é elegível", () => {
    expect(isFiscalEligibleOrder({ ...baseOrder, deleted_at: "2026-08-02T00:00:00.000Z" }, "all")).toBe(false);
  });

  it("17. cursor de paginação é estável e carrega o último número", () => {
    const cursor = encodeFiscalCursor(1051);
    expect(decodeFiscalCursor(cursor)).toEqual({ v: 1, lastNumber: "1051" });
    expect(() => decodeFiscalCursor("cursor-quebrado")).toThrow("Cursor inválido.");
  });

  it("18. valores são mantidos como inteiros em centavos", () => {
    const mapped = mapFiscalOrder(baseOrder, [baseItem], []);
    expect(Number.isInteger(mapped!.subtotalCents)).toBe(true);
    expect(Number.isInteger(mapped!.totalCents)).toBe(true);
    expect(mapped!.items[0].unitPriceCents).toBe(10790);
    expect(mapped!.items[0].totalCents).toBe(10790);
    expect(mapped!.itemsSubtotalCents).toBe(10790);
    expect(mapped!.unallocatedSubtotalCents).toBe(0);
  });

  it("19. desconto participa da consistência exata do total", () => {
    const discounted: FiscalOrderRow = { ...baseOrder, subtotal_cents: 12000, discount_cents: 1000, delivery_fee_cents: 500, total_cents: 11500 };
    expect(isFiscalEligibleOrder(discounted)).toBe(true);
    expect(isFiscalEligibleOrder({ ...discounted, total_cents: 11499 })).toBe(false);
  });

  it("20. taxa de entrega é preservada sem ponto flutuante", () => {
    const mapped = mapFiscalOrder(baseOrder, [baseItem], []);
    expect(mapped?.deliveryFeeCents).toBe(800);
    expect(mapped?.totalCents).toBe(11590);
  });

  it("21. múltiplos pagamentos são preservados em array", () => {
    const payments: FiscalPaymentRow[] = [
      { order_id: baseOrder.id, method: "pix", status: "paid", amount_cents: 5000, created_at: "2026-08-01T22:43:00Z" },
      { order_id: baseOrder.id, method: "cash", status: "paid", amount_cents: 6590, created_at: "2026-08-01T22:44:00Z" },
    ];
    const mapped = mapFiscalOrder(baseOrder, [baseItem], payments);
    expect(mapped?.payments).toEqual([
      { method: "pix", status: "paid", amountCents: 5000 },
      { method: "cash", status: "paid", amountCents: 6590 },
    ]);
  });

  it("22. resposta não contém informações sensíveis", () => {
    const mapped = mapFiscalOrder(baseOrder, [baseItem], []);
    const json = JSON.stringify(mapped);
    for (const forbidden of [
      "customerPhone",
      "customer_phone",
      "address",
      "tracking",
      "source_idempotency_key",
      "external_payload",
      "authorizationCode",
      "provider_transaction_id",
      "created_by",
    ]) expect(json).not.toContain(forbidden);
    expect(mapped?.customerTaxId).toBeNull();
  });

  it("23. status padrão é completed e cancelled não é aceito como filtro", () => {
    expect(params("").status).toBe("completed");
    expect(() => params("status=cancelled")).toThrow("Parâmetros inválidos.");
  });

  it("24. rota exporta somente GET e não inclui regras tributárias/Focus", () => {
    const root = process.cwd();
    const route = fs.readFileSync(path.join(root, "src/app/api/integrations/fiscal/orders/route.ts"), "utf8");
    const fiscalLib = ["auth.ts", "handler.ts", "mappings.ts", "orders.ts", "schemas.ts"]
      .map(file => fs.readFileSync(path.join(root, "src/lib/integrations/fiscal", file), "utf8"))
      .join("\n");
    expect(route).toMatch(/export async function GET/);
    expect(route).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/);
    expect(fiscalLib).not.toMatch(/Focus NFe|NCM|CFOP|CSOSN|CEST|COFINS|DANFC|SEFAZ/i);
  });

  it("25. divergência histórica entre linhas e subtotal é explícita sem criar item sintético", () => {
    const marketplaceOrder: FiscalOrderRow = {
      ...baseOrder,
      id: "ifood_real_10011",
      number: 10011,
      channel: "ifood",
      order_origin: "marketplace",
      payment_method: "credit",
      subtotal_cents: 2100,
      delivery_fee_cents: 600,
      total_cents: 2700,
    };
    const marketplaceItems: FiscalItemRow[] = [
      { ...baseItem, id: "ifood_item_1", order_id: marketplaceOrder.id, product_id: null, unit_price_cents: 500, name_snapshot: "Produto 1", sector: "kitchen" },
      { ...baseItem, id: "ifood_item_2", order_id: marketplaceOrder.id, product_id: null, unit_price_cents: 1300, name_snapshot: "Produto 2", sector: "kitchen" },
    ];
    const mapped = mapFiscalOrder(marketplaceOrder, marketplaceItems, []);
    expect(mapped?.items).toHaveLength(2);
    expect(mapped?.itemsSubtotalCents).toBe(1800);
    expect(mapped?.unallocatedSubtotalCents).toBe(300);
    expect(mapped?.subtotalCents).toBe(2100);
    expect(mapped?.items.some(item => item.kind === "fiscal_adjustment")).toBe(false);
  });
});
