import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  IfoodAdapter,
  ifoodEventCode,
  isIfoodKeepalive,
  verifyIfoodWebhookSignature,
} from "@/lib/integrations/ifood";
import { integrationErrorMessage } from "@/lib/workers/marketplace";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("integração oficial do iFood", () => {
  it("preserva detalhes de erros retornados pelo Supabase", () => {
    expect(integrationErrorMessage({ message: "Falha no banco", details: "Detalhe SQL", code: "P0001" }))
      .toContain("Falha no banco • Detalhe SQL • P0001");
  });
  it("valida X-IFood-Signature com HMAC SHA-256 sobre o corpo bruto", () => {
    const raw = JSON.stringify({ id: "event-1", code: "KEEPALIVE" });
    const secret = "test-secret";
    const signature = createHmac("sha256", secret).update(raw).digest("hex");
    expect(verifyIfoodWebhookSignature(raw, signature, secret)).toBe(true);
    expect(verifyIfoodWebhookSignature(`${raw}\n`, signature, secret)).toBe(false);
    expect(verifyIfoodWebhookSignature(raw, "invalid", secret)).toBe(false);
  });

  it("reconhece heartbeat e prioriza fullCode", () => {
    expect(isIfoodKeepalive({ code: "KEEPALIVE" })).toBe(true);
    expect(ifoodEventCode({ code: "CFM", fullCode: "ORDER_CONFIRMED" })).toBe("ORDER_CONFIRMED");
  });

  it("normaliza pedido, complementos, pagamento e total em centavos", () => {
    const adapter = new IfoodAdapter({ clientId: "id", clientSecret: "secret" });
    const order = adapter.normalizeOrder({
      id: "order-1",
      displayId: "1234",
      createdAt: "2026-08-09T03:00:00.000Z",
      orderType: "DELIVERY",
      customer: { name: "Cliente", phone: { number: "11999990000" } },
      delivery: { deliveredBy: "MERCHANT", deliveryAddress: { streetName: "Rua A", streetNumber: "10" } },
      items: [{
        id: "item-1",
        productId: "pizza-1",
        name: "Pizza Grande",
        quantity: 1,
        unitPrice: 7000,
        options: [{ id: "extra-1", name: "Bacon", quantity: 1, unitPrice: 500 }],
        observations: "Sem cebola",
      }],
      total: { subTotal: 7500, deliveryFee: 500, benefits: 1000, orderAmount: 7000 },
      payments: { prepaid: true, methods: [{ method: "PIX", type: "ONLINE" }] },
    });
    expect(order.externalId).toBe("order-1");
    expect(order.displayId).toBe("1234");
    expect(order.items[0].options[0].priceCents).toBe(500);
    expect(order.paymentMethod).toBe("pix");
    expect(order.totalCents).toBe(7000);
    expect(order.paid).toBe(true);
    expect(order.deliveredBy).toBe("MERCHANT");
    expect(order.deliveryAddress).toMatchObject({ street: "Rua A", number: "10" });
  });

  it("usa form-urlencoded na autenticação e chama o endpoint de confirmação", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ accessToken: "token", expiresIn: 300 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new IfoodAdapter({ clientId: "client", clientSecret: "secret", baseUrl: "https://merchant-api.ifood.com.br" });
    await adapter.acceptOrder("order-1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [authUrl, authInit] = fetchMock.mock.calls[0];
    expect(authUrl).toContain("/authentication/v1.0/oauth/token");
    expect(authInit.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(authInit.body).toContain("grantType=client_credentials");
    expect(fetchMock.mock.calls[1][0]).toContain("/order/v1.0/orders/order-1/confirm");
  });

  it("não despacha pedidos cuja entrega pertence ao iFood", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ accessToken: "token", expiresIn: 300 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "order-1", delivery: { deliveredBy: "IFOOD" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new IfoodAdapter({ clientId: "client", clientSecret: "secret" });
    await expect(adapter.updateStatus("order-1", "out_for_delivery")).rejects.toThrow("realizada pelo iFood");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
