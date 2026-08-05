import clsx, { type ClassValue } from "clsx";
export const cn = (...inputs: ClassValue[]) => clsx(inputs);
export const currency = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
export const shortDateTime = (iso: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
export const uid = (prefix = "id") => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
export const normalizePhone = (v: string) => v.replace(/\D/g, "").slice(0, 13);
export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export const isDemoMode = () => process.env.NEXT_PUBLIC_DEMO_MODE !== "false";
