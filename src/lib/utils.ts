import clsx, { type ClassValue } from "clsx";
export const cn = (...inputs: ClassValue[]) => clsx(inputs);
export const currency = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
/** Formata minutos decorridos de forma legível: "12 min", "2h 05min", "3d 4h". */
export const formatElapsedMinutes = (minutes: number) => {
  const total = Math.max(0, Math.floor(Number.isFinite(minutes) ? minutes : 0));
  if (total < 60) return `${total} min`;
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  if (days > 0) return hours ? `${days}d ${hours}h` : `${days}d`;
  return `${hours}h ${String(total % 60).padStart(2, "0")}min`;
};
/** Converte "55", "55,9", "1.234,50" ou "12.5" em centavos. */
export const parseMoneyInput = (text: string) => {
  const cleaned = text.replace(/[^0-9,.]/g, "");
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  return Math.max(0, Math.round((Number(normalized) || 0) * 100));
};
export const shortDateTime = (iso: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
export const uid = (prefix = "id") => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
export const normalizePhone = (v: string) => v.replace(/\D/g, "").slice(0, 13);
export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
// Fail-closed: somente com NEXT_PUBLIC_DEMO_MODE=true o painel usa dados fictícios.
// Sem a variável (ex.: esquecida no deploy) o sistema opera com dados reais.
export const isDemoMode = () => process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export const normalizeSearchText = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
