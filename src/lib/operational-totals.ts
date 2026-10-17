import type { DemoTab, Order } from "@/types";

export function tabBalance(tab: Pick<DemoTab, "totalCents" | "paidCents" | "serviceChargeRate" | "serviceChargeApplied">): number {
  const service = tab.serviceChargeApplied !== false ? Math.round(tab.totalCents * (tab.serviceChargeRate ?? 10) / 100) : 0;
  return Math.max(0, tab.totalCents + service - tab.paidCents);
}

export function pendingPaymentTotal(orders: Order[], tabs: DemoTab[]): number {
  const openTabs = tabs.filter(tab => tab.status === "open" || tab.status === "partial");
  const tabIds = new Set(openTabs.map(tab => tab.id));
  return openTabs.reduce((sum, tab) => sum + tabBalance(tab), 0) + orders.reduce((sum, order) => {
    if (order.status === "cancelled" || ["paid", "refunded", "cancelled"].includes(order.paymentStatus) || (order.tabId && tabIds.has(order.tabId))) return sum;
    return sum + Math.max(0, order.balanceDue ?? order.total - (order.paidAmount ?? 0));
  }, 0);
}

export function isOrderDelayed(order: { status: string; createdAt: string; estimatedReadyAt?: string }, now = Date.now()): boolean {
  if (!["received", "confirmed", "preparing", "ready", "out_for_delivery"].includes(order.status)) return false;
  const deadline = order.estimatedReadyAt ? Date.parse(order.estimatedReadyAt) : Date.parse(order.createdAt) + 60 * 60_000;
  return deadline < now;
}
