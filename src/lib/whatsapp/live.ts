import { dayKeys, weekdayPt, type OpeningHours } from "@/lib/opening-hours";
import { promotionIsActive } from "@/lib/promotions";
import type { PromotionRecord } from "@/types";
import { money } from "./domain";
import type { BotContext } from "./order";

const DAY_NAMES = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function saoPaulo(now: Date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now).map((p) => [p.type, p.value]));
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(String(parts.weekday));
  return { weekday: Math.max(0, weekday), time: `${parts.hour}:${parts.minute}` };
}

function hoursText(hours?: OpeningHours | null, fallback = "") {
  if (!hours) return fallback;
  return dayKeys.map((key) => `${weekdayPt[key]}: ${hours[key] ? `${hours[key]![0]} às ${hours[key]![1]}` : "fechado"}`).join("; ");
}

function promoLine(promo: PromotionRecord, flavorName: (id: string) => string) {
  const flavors = promo.targets.map((t) => t.flavorId).filter(Boolean).map((id) => flavorName(id!)).filter(Boolean);
  const days = promo.daysOfWeek.length ? promo.daysOfWeek.map((d) => DAY_NAMES[d]).join(", ") : "todos os dias";
  const channels = promo.channels.map((c) => (c === "own_delivery" ? "delivery" : c === "pickup" ? "retirada" : c === "counter" ? "balcão" : "salão")).join("/");
  return `*${promo.name}* (${days}): Pizza ${promo.pizzaSize === "broto" ? "Broto" : "Grande"} por ${money(promo.promoPrice)} cada, inteira ou meio a meio${flavors.length ? `; sabores: ${flavors.join(", ")}` : ""}; só ${channels}. ${promo.description || ""}`.trim();
}

/** Promoções válidas agora para delivery/retirada (as que o robô vende hoje). */
export function todayPromotions(context: BotContext, now = new Date()) {
  return (context.promotions || []).filter((p) => promotionIsActive(p, "own_delivery", now) || promotionIsActive(p, "pickup", now));
}

/** Dados vivos para a IA: dia e hora de agora, horário de funcionamento e promoções. */
export function liveStoreInfo(context: BotContext, now = new Date()) {
  const clock = saoPaulo(now);
  const flavorName = (id: string) => context.menu.flavors.find((f) => f.id === id)?.name || "";
  const today = todayPromotions(context, now);
  const others = (context.promotions || []).filter((p) => p.active && !p.paused && !today.some((t) => t.id === p.id));
  return [
    `AGORA: ${DAY_NAMES[clock.weekday]}, ${clock.time} (horário de Brasília). Loja ${context.store.open ? "ABERTA" : "FECHADA"} para pedidos agora.`,
    `TEMPO DE HOJE: retirada ${context.store.pickupTime || "não informado"}; entrega ${context.store.deliveryTime || "não informado"}.`,
    `HORÁRIO DE FUNCIONAMENTO: ${hoursText(context.store.openingHours, context.store.hours) || "não informado"}.`,
    `PROMOÇÕES DE HOJE: ${today.length ? today.map((p) => promoLine(p, flavorName)).join(" | ") : "nenhuma hoje"}.`,
    others.length ? `PROMOÇÕES DE OUTROS DIAS (só valem no dia): ${others.map((p) => promoLine(p, flavorName)).join(" | ")}.` : "",
  ].filter(Boolean).join("\n");
}
