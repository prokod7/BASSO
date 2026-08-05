export const LOYALTY_THRESHOLD = 10;
export const LOYALTY_MAX_BALANCE = 15;
export const LOYALTY_REWARD_FLAVORS = ["mozzarella", "calabresa-tradicional"] as const;

export function creditEligibleOrder(balance: number): number {
  if (!Number.isInteger(balance) || balance < 0) throw new Error("Saldo de fidelidade inválido.");
  return Math.min(LOYALTY_MAX_BALANCE, balance + 1);
}

export function redeemReward(balance: number, flavorId: string): number {
  if (!LOYALTY_REWARD_FLAVORS.includes(flavorId as (typeof LOYALTY_REWARD_FLAVORS)[number])) throw new Error("Sabor não elegível para a recompensa.");
  if (balance < LOYALTY_THRESHOLD) throw new Error("Saldo insuficiente.");
  return balance - LOYALTY_THRESHOLD;
}

export function isLoyaltyEligibleOrder(input: { channel: string; status: string; paymentStatus: string }): boolean {
  return input.channel === "own_delivery" && input.status === "completed" && input.paymentStatus === "paid";
}
