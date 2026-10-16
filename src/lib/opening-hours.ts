import { catalog } from "@/lib/catalog";

export const dayKeys = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;
export type DayKey = (typeof dayKeys)[number];
export type OpeningHours = Record<DayKey, [string, string] | null>;
export const weekdayPt: Record<DayKey, string> = {
  sunday: "domingo",
  monday: "segunda-feira",
  tuesday: "terça-feira",
  wednesday: "quarta-feira",
  thursday: "quinta-feira",
  friday: "sexta-feira",
  saturday: "sábado",
};
const shortDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function storeStatus(
  now = new Date(),
  hours: OpeningHours = catalog.business.hours as OpeningHours,
) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const index = shortDays.indexOf(parts.weekday);
  const current = `${parts.hour}:${parts.minute}`;
  const today = hours[dayKeys[index]],
    yesterday = hours[dayKeys[(index + 6) % 7]];
  if (yesterday && yesterday[0] > yesterday[1] && current < yesterday[1])
    return { open: true, label: `Aberto até ${yesterday[1]}` };
  if (today) {
    const [start, end] = today;
    if (
      start < end
        ? current >= start && current < end
        : current >= start && start !== end
    )
      return { open: true, label: `Aberto até ${end}` };
    if (current < start) return { open: false, label: `Abre às ${start}` };
  }
  for (let offset = 1; offset <= 7; offset++) {
    const key = dayKeys[(index + offset) % 7],
      next = hours[key];
    if (next)
      return {
        open: false,
        label:
          offset === 1
            ? `Abre amanhã às ${next[0]}`
            : `Abre ${weekdayPt[key]} às ${next[0]}`,
      };
  }
  return { open: false, label: "Fechado" };
}
export function openingHoursLabel(hours: OpeningHours) {
  return (
    dayKeys
      .filter((d) => hours[d])
      .map((d) => `${weekdayPt[d]} ${hours[d]![0]}–${hours[d]![1]}`)
      .join(" • ") || "Sem horário de atendimento"
  );
}
