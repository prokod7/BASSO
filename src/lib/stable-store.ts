"use client";

import { useDemoState, type DemoState } from "@/lib/demo-store";
import type { CartItem, DemoTable, Driver, Order } from "@/types";

/**
 * Wrapper seguro para o store legado.
 *
 * `useDemoState` usa useSyncExternalStore e, quando um selector devolve um novo
 * array/objeto a cada leitura, React 19 pode interpretar o snapshot como
 * continuamente alterado. Esta camada sempre assina o objeto raiz estável e
 * executa o selector depois da assinatura, permitindo filter/map/objetos
 * derivados sem criar loop de snapshot.
 */
export function useStableDemoState<T>(selector: (state: DemoState) => T): T {
  const state = useDemoState((snapshot) => snapshot);
  return selector(state);
}

function safeString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function safeNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeCartItem(value: unknown): CartItem | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const kind = item.kind;
  if (!["pizza", "product", "combo", "reward"].includes(String(kind))) return null;
  const selection = item.selection && typeof item.selection === "object"
    ? { ...(item.selection as Record<string, unknown>) }
    : undefined;
  if (selection) {
    if ("removedA" in selection && !Array.isArray(selection.removedA)) selection.removedA = [];
    if ("removedB" in selection && !Array.isArray(selection.removedB)) selection.removedB = [];
    if ("addons" in selection && (!selection.addons || typeof selection.addons !== "object" || Array.isArray(selection.addons))) selection.addons = {};
    if ("addonPlacements" in selection && (!selection.addonPlacements || typeof selection.addonPlacements !== "object" || Array.isArray(selection.addonPlacements))) selection.addonPlacements = {};
    if ("notes" in selection && typeof selection.notes !== "string") selection.notes = "";
  }
  return {
    id: safeString(item.id, `item-${cryptoSafeId()}`),
    kind: kind as CartItem["kind"],
    name: safeString(item.name, "Item"),
    quantity: Math.max(1, Math.trunc(safeNumber(item.quantity, 1))),
    unitPrice: Math.max(0, Math.trunc(safeNumber(item.unitPrice, 0))),
    image: typeof item.image === "string" ? item.image : undefined,
    productId: typeof item.productId === "string" ? item.productId : undefined,
    selection: selection as CartItem["selection"],
  };
}

function cryptoSafeId() {
  try {
    return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  } catch {
    return Math.random().toString(36).slice(2);
  }
}

function normalizeOrder(value: unknown): Order | null {
  if (!value || typeof value !== "object") return null;
  const order = value as Record<string, unknown>;
  const items = Array.isArray(order.items)
    ? order.items.map(normalizeCartItem).filter((item): item is CartItem => Boolean(item))
    : [];
  const channel = String(order.channel || "counter") as Order["channel"];
  const status = String(order.status || "received") as Order["status"];
  const paymentStatus = String(order.paymentStatus || "pending") as Order["paymentStatus"];
  const paymentMethod = String(order.paymentMethod || "cash") as Order["paymentMethod"];
  const address = order.address && typeof order.address === "object"
    ? {
        cep: safeString((order.address as Record<string, unknown>).cep),
        street: safeString((order.address as Record<string, unknown>).street),
        number: safeString((order.address as Record<string, unknown>).number),
        district: safeString((order.address as Record<string, unknown>).district),
        complement: typeof (order.address as Record<string, unknown>).complement === "string" ? String((order.address as Record<string, unknown>).complement) : undefined,
        reference: typeof (order.address as Record<string, unknown>).reference === "string" ? String((order.address as Record<string, unknown>).reference) : undefined,
        city: safeString((order.address as Record<string, unknown>).city, "Rio Grande da Serra"),
        state: safeString((order.address as Record<string, unknown>).state, "SP"),
        latitude: Number.isFinite(Number((order.address as Record<string, unknown>).latitude)) ? Number((order.address as Record<string, unknown>).latitude) : undefined,
        longitude: Number.isFinite(Number((order.address as Record<string, unknown>).longitude)) ? Number((order.address as Record<string, unknown>).longitude) : undefined,
      }
    : undefined;
  const now = new Date().toISOString();
  return {
    id: safeString(order.id, `order-${cryptoSafeId()}`),
    number: Math.trunc(safeNumber(order.number, 0)),
    channel,
    status,
    paymentStatus,
    customerName: safeString(order.customerName, "Cliente"),
    customerPhone: safeString(order.customerPhone),
    customerId: typeof order.customerId === "string" ? order.customerId : undefined,
    address,
    tableNumber: Number.isFinite(Number(order.tableNumber)) ? Number(order.tableNumber) : undefined,
    tabId: typeof order.tabId === "string" ? order.tabId : undefined,
    tabName: typeof order.tabName === "string" ? order.tabName : undefined,
    items,
    subtotal: Math.trunc(safeNumber(order.subtotal, 0)),
    discount: Math.trunc(safeNumber(order.discount, 0)),
    deliveryFee: Math.trunc(safeNumber(order.deliveryFee, 0)),
    total: Math.trunc(safeNumber(order.total, 0)),
    paymentMethod,
    changeFor: Number.isFinite(Number(order.changeFor)) ? Number(order.changeFor) : undefined,
    notes: typeof order.notes === "string" ? order.notes : undefined,
    couponCode: typeof order.couponCode === "string" ? order.couponCode : undefined,
    createdAt: safeString(order.createdAt, now),
    updatedAt: safeString(order.updatedAt, now),
    trackingToken: typeof order.trackingToken === "string" ? order.trackingToken : undefined,
    driverId: typeof order.driverId === "string" ? order.driverId : undefined,
    sourceIdempotencyKey: safeString(order.sourceIdempotencyKey, safeString(order.id, `order-${cryptoSafeId()}`)),
    rewardAuthorizationToken: typeof order.rewardAuthorizationToken === "string" ? order.rewardAuthorizationToken : undefined,
    origin: order.origin as Order["origin"],
    externalId: typeof order.externalId === "string" ? order.externalId : undefined,
    priority: order.priority as Order["priority"],
    estimatedReadyAt: typeof order.estimatedReadyAt === "string" ? order.estimatedReadyAt : undefined,
    viewedAt: typeof order.viewedAt === "string" ? order.viewedAt : undefined,
    assignedTo: typeof order.assignedTo === "string" ? order.assignedTo : undefined,
    internalSummary: typeof order.internalSummary === "string" ? order.internalSummary : undefined,
    version: Number.isFinite(Number(order.version)) ? Number(order.version) : 1,
    paidAmount: Number.isFinite(Number(order.paidAmount)) ? Number(order.paidAmount) : undefined,
    balanceDue: Number.isFinite(Number(order.balanceDue)) ? Number(order.balanceDue) : undefined,
    ...(typeof order.servedAt === "string" ? { servedAt: order.servedAt } : {}),
  } as Order;
}

function normalizeTable(value: unknown): DemoTable | null {
  if (!value || typeof value !== "object") return null;
  const table = value as Record<string, unknown>;
  const number = Number(table.number);
  if (!Number.isFinite(number)) return null;
  return {
    number,
    capacity: Math.max(1, safeNumber(table.capacity, 2)),
    status: (["free", "occupied", "cleaning", "partial"].includes(String(table.status)) ? String(table.status) : "free") as DemoTable["status"],
    people: Number.isFinite(Number(table.people)) ? Number(table.people) : undefined,
    openedAt: typeof table.openedAt === "string" ? table.openedAt : undefined,
    groupId: typeof table.groupId === "string" ? table.groupId : undefined,
    tabs: Array.isArray(table.tabs) ? table.tabs.map((tab) => {
      const raw = (tab || {}) as Record<string, unknown>;
      return {
        id: safeString(raw.id, `tab-${cryptoSafeId()}`),
        name: safeString(raw.name, "Comanda"),
        items: Array.isArray(raw.items) ? raw.items.map(normalizeCartItem).filter((item): item is CartItem => Boolean(item)) : [],
        paidCents: Math.max(0, safeNumber(raw.paidCents, 0)),
        totalCents: Math.max(0, safeNumber(raw.totalCents, 0)),
        serviceChargeRate: Number.isFinite(Number(raw.serviceChargeRate)) ? Number(raw.serviceChargeRate) : 10,
        serviceChargeApplied: raw.serviceChargeApplied !== false,
        serviceChargeCents: Math.max(0, safeNumber(raw.serviceChargeCents, 0)),
        waiter: safeString(raw.waiter, "Equipe"),
        status: (["open", "partial", "closed", "cancelled"].includes(String(raw.status)) ? String(raw.status) : "open") as "open" | "partial" | "closed" | "cancelled",
      };
    }) : [],
  };
}

function normalizeDriver(value: unknown): Driver | null {
  if (!value || typeof value !== "object") return null;
  const driver = value as Record<string, unknown>;
  const id = safeString(driver.id);
  if (!id) return null;
  return {
    id,
    name: safeString(driver.name, "Motoboy"),
    phone: safeString(driver.phone),
    vehicle: safeString(driver.vehicle, "Moto"),
    available: Boolean(driver.available),
    latitude: Number.isFinite(Number(driver.latitude)) ? Number(driver.latitude) : undefined,
    longitude: Number.isFinite(Number(driver.longitude)) ? Number(driver.longitude) : undefined,
    lastLocationAt: typeof driver.lastLocationAt === "string" ? driver.lastLocationAt : undefined,
    activeOrderId: typeof driver.activeOrderId === "string" ? driver.activeOrderId : undefined,
    shiftActive: Boolean(driver.shiftActive),
    shiftStartedAt: typeof driver.shiftStartedAt === "string" ? driver.shiftStartedAt : undefined,
    shiftEndedAt: typeof driver.shiftEndedAt === "string" ? driver.shiftEndedAt : undefined,
  };
}

/** Sanitiza dados de rede antes de entregá-los ao store legado. */
export function normalizeOperationalSnapshot(value: unknown): Partial<DemoState> {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    orders: Array.isArray(raw.orders) ? raw.orders.map(normalizeOrder).filter((order): order is Order => Boolean(order)) : [],
    tables: Array.isArray(raw.tables) ? raw.tables.map(normalizeTable).filter((table): table is DemoTable => Boolean(table)) : [],
    drivers: Array.isArray(raw.drivers) ? raw.drivers.map(normalizeDriver).filter((driver): driver is Driver => Boolean(driver)) : [],
    inventory: Array.isArray(raw.inventory) ? raw.inventory as DemoState["inventory"] : [],
    coupons: Array.isArray(raw.coupons) ? raw.coupons as DemoState["coupons"] : [],
    cashOpen: Boolean(raw.cashOpen),
    cashInitial: safeNumber(raw.cashInitial, 0),
    cashOpenedAt: typeof raw.cashOpenedAt === "string" ? raw.cashOpenedAt : undefined,
    cashMovements: Array.isArray(raw.cashMovements) ? raw.cashMovements as DemoState["cashMovements"] : [],
    financialEntries: Array.isArray(raw.financialEntries) ? raw.financialEntries as DemoState["financialEntries"] : [],
    campaigns: Array.isArray(raw.campaigns) ? raw.campaigns as DemoState["campaigns"] : [],
    integrationEvents: Array.isArray(raw.integrationEvents) ? raw.integrationEvents as DemoState["integrationEvents"] : [],
    audit: Array.isArray(raw.audit) ? raw.audit as DemoState["audit"] : [],
  };
}
