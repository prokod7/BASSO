"use client";
import { useSyncExternalStore } from "react";
import type { CartItem, OrderStatus } from "@/types";

export interface DeviceOrderRef {
  id: string;
  number: number;
  token?: string;
  phone: string;
  total: number;
  status: OrderStatus;
  createdAt: string;
  items: CartItem[];
}
interface DeviceState { orders: DeviceOrderRef[]; favorites: string[]; }
const KEY = "lfb-customer-device-v31";
let memory: DeviceState | null = null;
const listeners = new Set<() => void>();
const empty = (): DeviceState => ({ orders: [], favorites: [] });
function load(): DeviceState {
  if (memory) return memory;
  if (typeof window === "undefined") return empty();
  try { memory = { ...empty(), ...JSON.parse(localStorage.getItem(KEY) || "null") }; }
  catch { memory = empty(); }
  return memory!;
}
function save(next: DeviceState) {
  memory = next;
  if (typeof window !== "undefined") localStorage.setItem(KEY, JSON.stringify(next));
  listeners.forEach(listener => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => { if (event.key === KEY) { memory = null; listener(); } };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); };
}
export function useCustomerDeviceState<T>(selector: (state: DeviceState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(load()), () => selector(empty()));
}
export const customerDeviceActions = {
  saveOrder(order: DeviceOrderRef) {
    const state = load();
    save({ ...state, orders: [order, ...state.orders.filter(item => item.id !== order.id)].slice(0, 50) });
  },
  updateOrder(id: string, patch: Partial<DeviceOrderRef>) {
    const state = load();
    save({ ...state, orders: state.orders.map(order => order.id === id ? { ...order, ...patch } : order) });
  },
  toggleFavorite(ref: string) {
    const state = load();
    const favorites = state.favorites.includes(ref) ? state.favorites.filter(item => item !== ref) : [...state.favorites, ref];
    save({ ...state, favorites });
  },
  removeOrder(id: string) {
    const state = load(); save({ ...state, orders: state.orders.filter(order => order.id !== id) });
  }
};
