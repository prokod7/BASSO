import { describe, expect, it } from "vitest";
import { bestPizzaPromotion, bestProductPromotion, promotionIsActive, promotionRuntimeStatus } from "@/lib/promotions";
import { pdvPaymentMethods, publicPaymentMethods } from "@/lib/payment-methods";
import type { PizzaSelection, PromotionRecord } from "@/types";

function promo(overrides: Partial<PromotionRecord> = {}): PromotionRecord {
  return {
    id: "promo-1",
    name: "Terça Basso",
    description: "",
    badgeText: "Promoção do dia",
    promoPrice: 5990,
    active: true,
    paused: false,
    channels: ["own_delivery", "pickup", "counter", "dine_in", "table_qr"],
    daysOfWeek: [2],
    allowCouponStack: false,
    sortOrder: 0,
    targets: [{ id: "target-a", flavorId: "mozzarella" }, { id: "target-b", flavorId: "calabresa-tradicional" }],
    ...overrides,
  };
}

describe("promoções do dia", () => {
  it("usa America/Sao_Paulo para decidir o dia ativo", () => {
    const tuesdayAt19 = new Date("2026-09-15T22:00:00.000Z");
    const wednesdayAt19 = new Date("2026-09-16T22:00:00.000Z");
    expect(promotionRuntimeStatus(promo(), tuesdayAt19)).toBe("active");
    expect(promotionRuntimeStatus(promo(), wednesdayAt19)).toBe("scheduled");
  });

  it("pausa imediatamente sem apagar a agenda", () => {
    const date = new Date("2026-09-15T22:00:00.000Z");
    const paused = promo({ paused: true });
    expect(promotionRuntimeStatus(paused, date)).toBe("paused");
    expect(promotionIsActive(paused, "own_delivery", date)).toBe(false);
  });

  it("respeita período de datas e horário", () => {
    const scheduled = promo({ startsOn: "2026-09-15", endsOn: "2026-09-15", startTime: "18:00", endTime: "23:00" });
    expect(promotionRuntimeStatus(scheduled, new Date("2026-09-15T21:30:00.000Z"))).toBe("active");
    expect(promotionRuntimeStatus(scheduled, new Date("2026-09-16T03:30:00.000Z"))).toBe("ended");
  });

  it("só aplica pizza meio a meio quando todos os sabores participam", () => {
    const selection: PizzaSelection = { size: "grande", mass: "traditional", flavorA: "mozzarella", flavorB: "calabresa-tradicional", removedA: [], removedB: [], addons: {}, notes: "" };
    expect(bestPizzaPromotion([promo({ pizzaSize: "grande" })], selection, 7600, 0)?.promoUnitPrice).toBe(5990);
    const invalidHalf = { ...selection, flavorB: "portuguesa" };
    expect(bestPizzaPromotion([promo({ pizzaSize: "grande" })], invalidHalf, 7600, 0)).toBeUndefined();
  });

  it("mantém adicional fora do preço base promocional da pizza", () => {
    const selection: PizzaSelection = { size: "grande", mass: "traditional", flavorA: "mozzarella", removedA: [], removedB: [], addons: { bacon: 1 }, notes: "" };
    expect(bestPizzaPromotion([promo({ pizzaSize: "grande" })], selection, 8000, 1000)?.promoUnitPrice).toBe(6990);
  });

  it("escolhe o menor preço promocional elegível para produto", () => {
    const first = promo({ id: "a", promoPrice: 1000, targets: [{ id: "a1", productId: "coca" }] });
    const second = promo({ id: "b", promoPrice: 900, targets: [{ id: "b1", productId: "coca" }] });
    expect(bestProductPromotion([first, second], "coca", 1200)?.promoUnitPrice).toBe(900);
  });
});

describe("meios de pagamento", () => {
  it("não expõe vouchers e benefícios no checkout público", () => {
    expect(publicPaymentMethods).toEqual(["pix", "cash", "debit", "credit", "meal_voucher", "food_voucher"]);
    expect(publicPaymentMethods).not.toContain("vr_refeicao");
    expect(publicPaymentMethods).not.toContain("voucher");
  });

  it("disponibiliza os sete novos métodos somente no conjunto do PDV", () => {
    expect(pdvPaymentMethods).toEqual(expect.arrayContaining([
      "vr_refeicao", "vr_alimentacao", "sodexo", "pluxe", "alelo_refeicao", "ticket_restaurante", "voucher",
    ]));
  });
});