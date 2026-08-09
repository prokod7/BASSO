import type { OperationalRole } from "@/lib/authz";
import type { OrderChannel, OrderStatus } from "@/types";

export const orderTransitionMatrix: Record<OrderStatus, OrderStatus[]> = {
  received: ["confirmed", "cancelled"],
  confirmed: ["preparing", "received", "cancelled"],
  preparing: ["ready", "confirmed", "cancelled"],
  ready: ["out_for_delivery", "completed", "preparing", "cancelled"],
  out_for_delivery: ["completed", "ready", "cancelled"],
  completed: ["ready"],
  cancelled: ["received"],
};

const roleAllowedTargets: Record<OperationalRole, OrderStatus[]> = {
  manager: ["received", "confirmed", "preparing", "ready", "out_for_delivery", "completed", "cancelled"],
  counter: ["received", "confirmed", "preparing", "ready", "out_for_delivery", "completed", "cancelled"],
  waiter: ["confirmed", "preparing", "ready", "completed"],
  kitchen: ["preparing", "ready"],
  bar: ["preparing", "ready"],
  driver: ["out_for_delivery", "completed"],
  finance: ["completed"],
  viewer: [],
};

export function validTransitions(current: OrderStatus, channel: OrderChannel, role: OperationalRole): OrderStatus[] {
  return orderTransitionMatrix[current].filter((target) => {
    if (target === "out_for_delivery" && !["own_delivery", "ifood", "99food"].includes(channel)) return false;
    if (current === "ready" && target === "completed" && ["own_delivery", "ifood", "99food"].includes(channel)) return false;
    return roleAllowedTargets[role].includes(target);
  });
}

export function requiresTransitionReason(current: OrderStatus, target: OrderStatus): boolean {
  if (target === "cancelled") return true;
  const forward: Record<OrderStatus, number> = {
    received: 1,
    confirmed: 2,
    preparing: 3,
    ready: 4,
    out_for_delivery: 5,
    completed: 6,
    cancelled: 7,
  };
  return forward[target] <= forward[current] || forward[target] > forward[current] + 1;
}

export function assertOrderTransition(input: {
  current: OrderStatus;
  target: OrderStatus;
  channel: OrderChannel;
  role: OperationalRole;
  reason?: string | null;
}) {
  if (input.current === input.target) return;
  const allowed = validTransitions(input.current, input.channel, input.role);
  if (!allowed.includes(input.target)) {
    throw new Error(`Transição não permitida: ${input.current} → ${input.target}.`);
  }
  if (requiresTransitionReason(input.current, input.target) && !input.reason?.trim()) {
    throw new Error("Informe o motivo para cancelar, reabrir ou retornar uma etapa.");
  }
}
