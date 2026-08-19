import { catalog } from "@/lib/catalog";

const dayKeys = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
type DayKey = typeof dayKeys[number];
const weekdayMap: Record<string, DayKey> = { Sun: "sunday", Mon: "monday", Tue: "tuesday", Wed: "wednesday", Thu: "thursday", Fri: "friday", Sat: "saturday" };
const weekdayPt: Record<DayKey, string> = { sunday: "domingo", monday: "segunda-feira", tuesday: "terça-feira", wednesday: "quarta-feira", thursday: "quinta-feira", friday: "sexta-feira", saturday: "sábado" };

function nextOpening(fromIndex: number) {
  for (let offset = 1; offset <= 7; offset += 1) {
    const index = (fromIndex + offset) % 7;
    const key = dayKeys[index];
    const hours = catalog.business.hours[key];
    if (hours) return { offset, key, open: hours[0] };
  }
  return null;
}

export function storeStatus(now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: catalog.business.timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(now).map((part) => [part.type, part.value]));
  const key = weekdayMap[parts.weekday];
  const dayIndex = dayKeys.indexOf(key);
  const hours = catalog.business.hours[key];
  const current = `${parts.hour}:${parts.minute}`;

  if (hours) {
    if (current >= hours[0] && current < hours[1]) return { open: true, label: `Aberto até ${hours[1]}` };
    if (current < hours[0]) return { open: false, label: `Abre às ${hours[0]}` };
  }

  const next = nextOpening(dayIndex);
  if (!next) return { open: false, label: "Fechado" };
  if (next.offset === 1) return { open: false, label: `Abre amanhã às ${next.open}` };
  return { open: false, label: `Abre ${weekdayPt[next.key]} às ${next.open}` };
}
