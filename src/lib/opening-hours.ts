import { catalog } from "@/lib/catalog";
const dayKeys = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
export function storeStatus(now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: catalog.business.timezone, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  const parts = Object.fromEntries(formatter.formatToParts(now).map(p => [p.type, p.value]));
  const weekdayMap: Record<string, typeof dayKeys[number]> = { Sun: "sunday", Mon: "monday", Tue: "tuesday", Wed: "wednesday", Thu: "thursday", Fri: "friday", Sat: "saturday" };
  const key = weekdayMap[parts.weekday];
  const hours = catalog.business.hours[key];
  if (!hours) return { open: false, label: "Fechado hoje" };
  const current = `${parts.hour}:${parts.minute}`;
  const open = current >= hours[0] && current < hours[1];
  return { open, label: open ? `Aberto até ${hours[1]}` : `Abre às ${hours[0]}` };
}
