import { describe, expect, it } from "vitest";
import { allowedStatuses, nextStatus } from "@/lib/order-validation";
import { creditEligibleOrder, isLoyaltyEligibleOrder, redeemReward } from "@/lib/loyalty";

describe("status por canal", () => {
  it("omite saída para entrega em retirada, salão e balcão", () => {
    expect(allowedStatuses("pickup")).not.toContain("out_for_delivery");
    expect(allowedStatuses("dine_in")).not.toContain("out_for_delivery");
    expect(allowedStatuses("counter")).not.toContain("out_for_delivery");
  });
  it("mantém saída para entrega no delivery", () => {
    expect(nextStatus("ready", "own_delivery")).toBe("out_for_delivery");
  });
});

describe("fidelidade interna", () => {
  it("pontua somente delivery próprio concluído e pago", () => {
    expect(isLoyaltyEligibleOrder({ channel: "own_delivery", status: "completed", paymentStatus: "paid" })).toBe(true);
    expect(isLoyaltyEligibleOrder({ channel: "ifood", status: "completed", paymentStatus: "paid" })).toBe(false);
    expect(isLoyaltyEligibleOrder({ channel: "pickup", status: "completed", paymentStatus: "paid" })).toBe(false);
  });
  it("limita o saldo a 15 e consome 10 no resgate", () => {
    expect(creditEligibleOrder(15)).toBe(15);
    expect(redeemReward(15, "mozzarella")).toBe(5);
    expect(redeemReward(10, "calabresa-tradicional")).toBe(0);
    expect(() => redeemReward(9, "mozzarella")).toThrow(/insuficiente/i);
    expect(() => redeemReward(10, "camarao")).toThrow(/não elegível/i);
  });
});
