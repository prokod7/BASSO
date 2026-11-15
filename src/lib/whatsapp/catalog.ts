import { createHash, randomUUID } from "node:crypto";
import { districtForStreet, expandDistrict, type KnownStreet } from "./streets";
import { comboConfig } from "@/lib/combos";
import { catalog as staticCatalog } from "@/lib/catalog";
import { activeMasses, defaultMass, pizzaOptions } from "@/lib/pizza-options";
import { scheduleAllows, type RuntimeMenu } from "@/lib/server-menu-pricing";
import { normalizeSearchText } from "@/lib/utils";
import type { AddonPlacement, CartItem, ComboSelection, Flavor, OrderChannel, PizzaSelection } from "@/types";
import { localPhone, type Basket, type WaPaymentMethod } from "./domain";

/**
 * Cardápio compacto e barato em tokens para a IA do WhatsApp.
 *
 * A IA nunca vê os IDs internos: cada item recebe um código curto e estável derivado do
 * próprio ID (prefixo + hash), então um código sempre aponta para o mesmo item mesmo com
 * o cardápio mudando. Código que deixa de existir é rejeitado, nunca remapeado. O texto é
 * determinístico para o mesmo cardápio, mantendo o prefixo do prompt igual entre clientes
 * (desconto de cache na OpenAI).
 */
export type Zone = { name: string; city: string | null; districts: string[]; fee_cents: number; minimum_order_cents: number };
export type Codes = { flavor: Map<string, string>; addon: Map<string, string>; product: Map<string, string>; combo: Map<string, string> };
export type CompactCatalog = { text: string; codes: Codes; reverse: Codes };
type AnyProduct = RuntimeMenu["products"][number];

const BOT_CHANNELS: OrderChannel[] = ["own_delivery", "pickup"];

function codeMap(prefix: string, ids: string[]) {
  const hashed = [...new Set(ids)].sort().map((id) => [id, createHash("sha1").update(id).digest("hex")] as const);
  let length = 3;
  while (length < 40 && new Set(hashed.map(([, h]) => h.slice(0, length))).size !== hashed.length) length++;
  return new Map(hashed.map(([id, h]) => [id, prefix + h.slice(0, length)]));
}
const invert = (map: Map<string, string>) => new Map([...map].map(([id, code]) => [code, id]));

export function reais(cents: number) {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2).replace(".", ",");
}

type Channelled = { active: boolean; availableChannels?: OrderChannel[]; availableSchedule?: unknown };
function channels(item: Channelled) {
  return BOT_CHANNELS.filter((c) => !item.availableChannels?.length || item.availableChannels.includes(c));
}
function kindNote(item: Channelled) {
  const list = channels(item);
  return list.length === BOT_CHANNELS.length ? "" : list[0] === "own_delivery" ? " (só entrega)" : " (só retirada)";
}

/** Itens que o robô pode vender agora (ativos, categoria ativa, canal e horário liberados, com estoque). */
export function sellable(menu: RuntimeMenu, now = new Date()) {
  const activeCategories = new Set(menu.categories.filter((c) => c.active).map((c) => c.id));
  const ok = (item: Channelled) => item.active && channels(item).length > 0 && scheduleAllows(item.availableSchedule, now);
  const flavors = (menu.flavors as Array<Flavor & Channelled>).filter((f) => ok(f) && activeCategories.has(f.category));
  const products = menu.products.filter((p) => ok(p) && p.stockAvailable && activeCategories.has(p.category));
  const addons = menu.addons.filter((a) => a.active);
  return { flavors, products, addons };
}

/** Ingredientes que o cliente pode tirar (a massa não entra na lista). */
export const removableIngredients = (flavor: Flavor) => flavor.ingredients.filter((i) => !/^massa\b/i.test(i.trim()));

function comboText(product: AnyProduct, codes: Codes, flavors: Flavor[]) {
  try {
    const config = comboConfig({ grandeFlavors: staticCatalog.combo.options.grandeFlavors, beverages: staticCatalog.combo.options.beverages, sweetFlavor: staticCatalog.combo.options.sweetFlavor, ...(product.config || {}) });
    const flavorCodes = (ids: string[]) => ids.filter((id) => flavors.some((f) => f.id === id)).map((id) => codes.flavor.get(id)).filter(Boolean).join("|");
    const sweet = config.sweetFlavors || [config.sweetFlavor];
    return `${codes.combo.get(product.id)} ${product.name} ${reais(product.price)}${kindNote(product)}: ${config.grandeQuantity} Grande salgada [${flavorCodes(config.grandeFlavors)}]${config.allowHalfHalf ? " (aceita meio a meio)" : " (inteira)"}; ${config.sweetSize === "broto" ? "Broto" : "Grande"} doce [${flavorCodes(sweet)}]; bebida [${config.beverages.map((id) => codes.product.get(id)).filter(Boolean).join("|")}]`;
  } catch {
    return "";
  }
}

export function compactCatalog(menu: RuntimeMenu, zones: Zone[], store: { name: string; address: string }, now = new Date()): CompactCatalog {
  const { flavors, products, addons } = sellable(menu, now);
  const combos = products.filter((p) => p.category === "combo");
  const simple = products.filter((p) => p.category !== "combo");
  const codes: Codes = {
    flavor: codeMap("s", flavors.map((f) => f.id)),
    addon: codeMap("a", addons.map((a) => a.id)),
    product: codeMap("p", simple.map((p) => p.id)),
    combo: codeMap("c", combos.map((p) => p.id)),
  };
  const options = pizzaOptions();
  const masses = activeMasses();
  const lines: string[] = [`LOJA: ${store.name} — ${store.address}`, ""];
  lines.push(
    "REGRAS DA PIZZA (preços em R$; G = Grande, B = Broto)",
    "- Grande: 1 ou 2 sabores (meio a meio cobra metade do preço de cada sabor). Qualquer sabor combina com qualquer outro na Grande.",
    "- Broto: inteira de qualquer sabor; meio a meio com dois salgados ou dois doces. Nunca misture doce com salgado na Broto.",
    "- Borda: todas saem com a borda tradicional da casa. NÃO existem bordas recheadas nem opções de borda.",
    masses.length > 1
      ? `- Massas: ${masses.map((m, i) => `${m.name}${i === 0 ? " (padrão)" : ""}${m.price ? ` +${reais(m.price)}` : ""}`).join("; ")}. Pergunte uma vez qual massa.`
      : `- Massa: ${masses[0]?.name ?? "Tradicional"} (única opção, não pergunte).`,
    `- Pizza doce: pergunte se quer cortada ou sem cortar.${options.hazelnut.active ? ` Base opcional ${options.hazelnut.name} +${reais(options.hazelnut.price)} (só em pizza doce).` : ""}`,
    "- Adicionais: na pizza inteira (half 0) ou só em uma metade do meio a meio (half 1 ou 2; metade cobra 50% do adicional). Máx. 2 de cada adicional e 5 adicionais por pizza.",
    "- Promoções do dia são aplicadas automaticamente no resumo.",
    "",
  );
  const categoryName: Record<string, string> = { traditional: "SABORES TRADICIONAIS", premium: "SABORES PREMIUM", sweet: "SABORES DOCES" };
  for (const category of ["traditional", "premium", "sweet"]) {
    const list = flavors.filter((f) => f.category === category);
    if (!list.length) continue;
    lines.push(categoryName[category]);
    for (const f of list) lines.push(`${codes.flavor.get(f.id)} ${f.name} G${reais(f.priceGrande)} B${reais(f.priceBroto)}${kindNote(f as Flavor & Channelled)} | ${removableIngredients(f).join(", ")}`);
    lines.push("");
  }
  if (addons.length) lines.push("ADICIONAIS (preço por unidade na pizza inteira)", addons.map((a) => `${codes.addon.get(a.id)} ${a.name} +${reais(a.price)}`).join(" | "), "");
  const sections: Array<[string, (p: AnyProduct) => boolean]> = [
    ["BEBIDAS", (p) => p.category === "beverages"],
    ["SOBREMESAS", (p) => p.category === "desserts"],
    ["OUTROS", (p) => !["beverages", "desserts"].includes(p.category)],
  ];
  for (const [title, test] of sections) {
    const list = simple.filter(test);
    if (list.length) lines.push(title, ...list.map((p) => `${codes.product.get(p.id)} ${p.name} ${reais(p.price)}${kindNote(p)}`), "");
  }
  const comboLines = combos.map((p) => comboText(p, codes, flavors)).filter(Boolean);
  if (comboLines.length) lines.push("COMBOS", ...comboLines, "");
  if (zones.length) {
    lines.push("ENTREGA (bairros atendidos: taxa em R$; fora da lista não entregamos)");
    const byCity = new Map<string, string[]>();
    for (const zone of zones) {
      const city = zone.city || "";
      const minimum = zone.minimum_order_cents ? ` (pedido mín. ${reais(zone.minimum_order_cents)})` : "";
      for (const district of zone.districts) byCity.set(city, [...(byCity.get(city) ?? []), `${district} ${zone.fee_cents ? reais(zone.fee_cents) : "grátis"}${minimum}`]);
    }
    for (const [city, list] of [...byCity].sort(([a], [b]) => a.localeCompare(b, "pt-BR"))) lines.push(`${city || "Cidade da loja"}: ${list.sort((a, b) => a.localeCompare(b, "pt-BR")).join(" | ")}`);
  } else lines.push("ENTREGA: indisponível no momento (bairros não configurados). Ofereça retirada.");
  return {
    text: lines.join("\n").trim(),
    codes,
    reverse: { flavor: invert(codes.flavor), addon: invert(codes.addon), product: invert(codes.product), combo: invert(codes.combo) },
  };
}

/* ---------------- Pedido montado pela IA → itens do checkout ---------------- */

export type DraftItem = {
  type: "pizza" | "product" | "combo";
  code: string;
  qty: number;
  size: "grande" | "broto" | null;
  mass: "traditional" | "integral" | null;
  flavors: string[];
  addons: { code: string; qty: number; half: 0 | 1 | 2 }[];
  remove: { ingredient: string; half: 0 | 1 | 2 }[];
  sweet_base: "standard" | "hazelnut" | null;
  cut: "cut" | "uncut" | null;
  combo: { flavors: string[]; second_flavors: string[]; sweet_flavor: string | null; beverage: string | null } | null;
  notes: string;
};
export type Draft = {
  kind: "delivery" | "pickup";
  name: string;
  method: WaPaymentMethod;
  change_for: number | null;
  coupon: string | null;
  address: { street: string; number: string; complement: string; neighborhood: string; city: string; reference: string } | null;
  items: DraftItem[];
};

const norm = (value: string) => normalizeSearchText(value).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const PREFIX = /^(jardim|jd|vila|vl|parque|pq|conjunto|conj|residencial|res|bairro|chacara|recanto|jardins|estancia|nucleo|sitio|loteamento)\s+/;
// Abreviações ("Jd.", "Vl.", "Pq.", "Sta.") e nomes curtos ("Vila Conde") viram o nome por extenso.
const loose = (value: string) => norm(expandDistrict(value)).replace(PREFIX, "").replace(/z/g, "s");

function distance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

/**
 * Reconhece o bairro como o cliente escreve (sem acento, sem "Jardim/Vila", s/z, pequenos
 * erros, nome parcial) entre os bairros cadastrados no painel de delivery. A cidade vem do
 * bairro; só é perguntada quando o bairro existe em mais de uma cidade.
 */
export function matchDistrict(input: string, cityInput: string, zones: Zone[]): { district: string; city: string } {
  const wanted = loose(input);
  if (!wanted) throw new Error("Qual é o bairro da entrega?");
  const all = zones.flatMap((zone) => zone.districts.map((district) => ({ district, city: zone.city || "" })));
  const city = loose(cityInput);
  const pool = city ? all.filter((d) => loose(d.city) === city || loose(d.city).startsWith(city)) : all;
  const candidates = pool.length ? pool : all;
  const tiers = [
    (d: { district: string }) => loose(d.district) === wanted,
    (d: { district: string }) => loose(d.district).startsWith(wanted) || wanted.startsWith(loose(d.district)),
    (d: { district: string }) => wanted.length >= 4 && loose(d.district).includes(wanted),
    (d: { district: string }) => wanted.length >= 5 && distance(loose(d.district), wanted) <= (wanted.length >= 9 ? 2 : 1),
  ];
  for (const tier of tiers) {
    const found = candidates.filter(tier);
    const unique = [...new Map(found.map((d) => [`${d.district}|${d.city}`, d])).values()];
    if (unique.length === 1) return unique[0];
    if (unique.length > 1) {
      const cities = [...new Set(unique.map((d) => d.city))];
      if (cities.length > 1 && new Set(unique.map((d) => loose(d.district))).size === 1) throw new Error(`O bairro ${unique[0].district} fica em qual cidade: ${cities.join(" ou ")}?`);
      throw new Error(`Qual destes é o seu bairro: ${unique.slice(0, 4).map((d) => d.district).join(", ")}?`);
    }
  }
  throw new Error(`Infelizmente ainda não entregamos no bairro ${input.trim()} 😕 Quer retirar na loja?`);
}

function ingredientMatch(flavor: Flavor, wanted: string) {
  const list = removableIngredients(flavor);
  const target = norm(wanted);
  return list.find((i) => norm(i) === target) ?? list.find((i) => norm(i).includes(target) || target.includes(norm(i)));
}

function resolvePizza(item: DraftItem, catalog: CompactCatalog, menu: RuntimeMenu): CartItem {
  const flavorOf = (code: string) => {
    const id = catalog.reverse.flavor.get(code.trim());
    const flavor = id ? menu.flavors.find((f) => f.id === id) : undefined;
    if (!flavor) throw new Error("Um dos sabores escolhidos não está disponível agora. Pode escolher outro?");
    return flavor;
  };
  if (!item.flavors.length || item.flavors.length > 2) throw new Error("Escolha 1 ou 2 sabores para a pizza");
  const [a, b] = item.flavors.map(flavorOf);
  const size = item.size === "broto" ? "broto" : "grande";
  const mass = item.mass && activeMasses().some((m) => m.id === item.mass) ? item.mass : defaultMass();
  const addons: Record<string, number> = {};
  const placements: Record<string, AddonPlacement> = {};
  for (const extra of item.addons) {
    const id = catalog.reverse.addon.get(extra.code.trim());
    if (!id) throw new Error("Um dos adicionais não está disponível agora");
    const place: AddonPlacement = !b || extra.half === 0 ? "whole" : extra.half === 1 ? "halfA" : "halfB";
    // Um mesmo adicional nas duas metades vira "pizza inteira" (o sistema guarda um lugar por adicional).
    placements[id] = placements[id] && placements[id] !== place ? "whole" : place;
    addons[id] = (addons[id] ?? 0) + Math.max(1, Math.trunc(extra.qty || 1));
  }
  const removedA: string[] = [], removedB: string[] = [];
  for (const removal of item.remove) {
    const both: Array<[Flavor, string[]]> = b ? [[a, removedA], [b, removedB]] : [[a, removedA]];
    const targets: Array<[Flavor, string[]]> = !b || removal.half === 0 ? both : removal.half === 1 ? [[a, removedA]] : [[b, removedB]];
    let found = false;
    for (const [flavor, list] of targets) {
      const ingredient = ingredientMatch(flavor, removal.ingredient);
      if (ingredient) { found = true; if (!list.includes(ingredient)) list.push(ingredient); }
    }
    if (!found) throw new Error(`A ${targets.map(([f]) => f.name).join(" / ")} não leva "${removal.ingredient}"`);
  }
  const sweet = a.category === "sweet" || b?.category === "sweet";
  const selection: PizzaSelection = {
    size, mass, flavorA: a.id, ...(b ? { flavorB: b.id } : {}),
    removedA, removedB, addons, addonPlacements: placements, notes: item.notes.trim().slice(0, 500),
    ...(sweet ? { sweetBase: item.sweet_base === "hazelnut" ? "hazelnut-zero" : "standard", cutPreference: item.cut === "cut" ? "cut" : "uncut" } : {}),
  };
  return { id: randomUUID(), kind: "pizza", name: "Pizza", quantity: item.qty, unitPrice: 0, selection };
}

function resolveCombo(item: DraftItem, catalog: CompactCatalog, menu: RuntimeMenu): CartItem {
  const id = catalog.reverse.combo.get(item.code.trim());
  const product = id ? menu.products.find((p) => p.id === id) : undefined;
  if (!product || !item.combo) throw new Error("Esse combo não está disponível agora");
  const flavor = (code: string | null | undefined) => {
    if (!code) return undefined;
    const flavorId = catalog.reverse.flavor.get(code.trim());
    if (!flavorId) throw new Error("Um dos sabores do combo não está disponível agora");
    return flavorId;
  };
  const beverage = item.combo.beverage ? catalog.reverse.product.get(item.combo.beverage.trim()) : undefined;
  if (!beverage) throw new Error("Qual bebida você quer no combo?");
  const [grandeFlavor, grandeFlavorB] = item.combo.flavors.map(flavor);
  if (!grandeFlavor) throw new Error("Qual sabor você quer na pizza Grande do combo?");
  const [secondGrandeFlavor, secondGrandeFlavorB] = item.combo.second_flavors.map(flavor);
  const mass = item.mass && activeMasses().some((m) => m.id === item.mass) ? item.mass : defaultMass();
  const selection: ComboSelection & { sweetCutPreference?: "cut" | "uncut" } = {
    mass, grandeFlavor, ...(grandeFlavorB ? { grandeFlavorB } : {}),
    ...(secondGrandeFlavor ? { secondGrandeFlavor } : {}), ...(secondGrandeFlavorB ? { secondGrandeFlavorB } : {}),
    ...(item.combo.sweet_flavor ? { sweetFlavor: flavor(item.combo.sweet_flavor) } : {}),
    sweetCutPreference: item.cut === "cut" ? "cut" : "uncut",
    brigadeiroBase: "chocolate-ao-leite", beverage, addons: {}, notes: item.notes.trim().slice(0, 500),
  };
  return { id: randomUUID(), kind: "combo", name: product.name, productId: product.id, quantity: item.qty, unitPrice: 0, selection };
}

/** Traduz os códigos da IA para itens do checkout. Preços são calculados depois, no servidor. */
export function resolveDraft(draft: Draft, menu: RuntimeMenu, catalog: CompactCatalog, waPhone: string, zones: Zone[], store: { city: string; state: string }, learnedStreets: KnownStreet[] = []): Basket {
  const name = draft.name.trim();
  if (name.length < 2) throw new Error("Qual o seu nome?");
  const items = draft.items.map((item): CartItem => {
    if (item.type === "pizza") return resolvePizza(item, catalog, menu);
    if (item.type === "combo") return resolveCombo(item, catalog, menu);
    const id = catalog.reverse.product.get(item.code.trim());
    const product = id ? menu.products.find((p) => p.id === id) : undefined;
    if (!product) throw new Error("Um dos itens não está disponível agora");
    return { id: randomUUID(), kind: "product", name: product.name, productId: product.id, quantity: item.qty, unitPrice: 0 };
  });
  if (!items.length) throw new Error("Me diga o que você quer pedir");
  const basket: Basket = {
    channel: draft.kind === "delivery" ? "own_delivery" : "pickup",
    customerName: name.slice(0, 120),
    customerPhone: localPhone(waPhone),
    paymentMethod: draft.method,
    items,
    idempotencyKey: `wa-${randomUUID()}`,
  };
  if (draft.method === "cash" && draft.change_for) basket.changeFor = Math.round(draft.change_for * 100);
  if (draft.coupon?.trim()) basket.couponCode = draft.coupon.trim().toUpperCase().slice(0, 30);
  if (basket.channel === "own_delivery") {
    const a = draft.address;
    if (!a?.street.trim() || !a.number.trim()) throw new Error("Me manda o endereço completo: rua, número e bairro");
    if (!zones.length) throw new Error("A entrega está indisponível no momento. Quer retirar na loja?");
    // Bairro pela rua: o cliente que só manda "Rua X, 123" não precisa dizer o bairro.
    const byStreet = () => {
      const known = districtForStreet(a.street, a.city, learnedStreets);
      if (!known) return null;
      try { return matchDistrict(known.district, known.city, zones); } catch { return null; }
    };
    let place: { district: string; city: string };
    if (!a.neighborhood.trim()) {
      const found = byStreet();
      if (!found) throw new Error("Qual é o bairro da entrega?");
      place = found;
    } else {
      try { place = matchDistrict(a.neighborhood, a.city, zones); }
      catch (error) { const found = byStreet(); if (!found) throw error; place = found; }
    }
    basket.address = {
      cep: "", street: a.street.trim().slice(0, 150), number: a.number.trim().slice(0, 15), district: place.district,
      complement: a.complement.trim().slice(0, 150) || undefined, reference: a.reference.trim().slice(0, 200) || undefined,
      city: place.city || store.city, state: store.state,
    };
  }
  return basket;
}

