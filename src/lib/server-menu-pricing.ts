import { catalog } from "@/lib/catalog";
import { addonPrice, comboTotal, pizzaTotal, validatePizzaSelection } from "@/lib/pricing";
import type { Addon, CartItem, Flavor, MenuCategory, OrderChannel, PizzaSelection, ComboSelection } from "@/types";

const OFFICIAL_PROMO_FLAVORS = ["calabresa-tradicional", "mozzarella"] as const;

type SweetPizzaSelection = PizzaSelection & {
  sweetBase?: "standard" | "hazelnut-zero";
  cutPreference?: "uncut" | "cut";
};

type ComboSelectionWithSweetCut = ComboSelection & {
  sweetCutPreference?: "uncut" | "cut";
};

interface RuntimeProduct {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  active: boolean;
  stockTracked: boolean;
  availableChannels: OrderChannel[];
  availableSchedule: unknown;
  stockAvailable: boolean;
  config?: Record<string, unknown>;
  image?: string;
  variant?: string;
  allergens?: string[];
}

export interface RuntimeMenu {
  categories: MenuCategory[];
  flavors: Flavor[];
  addons: Addon[];
  products: RuntimeProduct[];
}

function saoPauloClock(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const weekday = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].indexOf(map.weekday);
  return { weekday, minutes: Number(map.hour) * 60 + Number(map.minute) };
}

function toMinutes(value: unknown) {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? hour * 60 + minute : null;
}

export function scheduleAllows(schedule: unknown, date = new Date()): boolean {
  if (!schedule || typeof schedule !== "object" || Array.isArray(schedule) || Object.keys(schedule as object).length === 0) return true;
  const config = schedule as { days?: number[]; start?: string; end?: string; windows?: Array<{ days?: number[]; start?: string; end?: string }> };
  const windows = Array.isArray(config.windows) && config.windows.length ? config.windows : [config];
  const clock = saoPauloClock(date);
  return windows.some(window => {
    if (Array.isArray(window.days) && !window.days.includes(clock.weekday)) return false;
    const start = toMinutes(window.start);
    const end = toMinutes(window.end);
    if (start == null || end == null) return true;
    return start <= end ? clock.minutes >= start && clock.minutes <= end : clock.minutes >= start || clock.minutes <= end;
  });
}

export async function loadRuntimeMenu(db: any): Promise<RuntimeMenu> {
  const [categoriesResult, flavorsResult, addonsResult, productsResult, inventoryResult] = await Promise.all([
    db.from("categories").select("id,name,kind,sort_order,active,image_url").is("deleted_at", null).order("sort_order").order("name"),
    db.from("pizza_flavors").select("id,name,category,price_grande_cents,price_broto_cents,ingredients,description,featured,active,available_channels,available_schedule,allergens"),
    db.from("addons").select("id,name,price_cents,max_quantity,active"),
    db.from("products").select("id,name,category,description,variant,price_cents,image_url,allergens,stock_tracked,active,available_channels,available_schedule,config").is("deleted_at", null),
    db.from("inventory_items").select("product_id,quantity,allow_negative")
  ]);
  const failed = [categoriesResult, flavorsResult, addonsResult, productsResult, inventoryResult].find(result => result.error);
  if (failed?.error) throw failed.error;
  const inventory = new Map((inventoryResult.data || []).map((row: any) => [row.product_id, row]));
  return {
    categories: (categoriesResult.data || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      kind: row.kind,
      sortOrder: Number(row.sort_order || 0),
      active: Boolean(row.active),
      image: row.image_url || undefined,
    })),
    flavors: (flavorsResult.data || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      priceGrande: Number(row.price_grande_cents),
      priceBroto: Number(row.price_broto_cents),
      ingredients: row.ingredients || [],
      description: row.description || "",
      featured: Boolean(row.featured),
      active: Boolean(row.active),
      availableChannels: row.available_channels || [],
      availableSchedule: row.available_schedule || {},
      allergens: row.allergens || []
    })) as Array<Flavor & { availableChannels: OrderChannel[]; availableSchedule: unknown }>,
    addons: (addonsResult.data || []).map((row: any) => ({ id: row.id, name: row.name, price: Number(row.price_cents), maxQuantity: Number(row.max_quantity || 2), active: Boolean(row.active) })),
    products: (productsResult.data || []).map((row: any) => {
      const stock = inventory.get(row.id) as any;
      const stockAvailable = !row.stock_tracked || !stock || Boolean(stock.allow_negative) || Number(stock.quantity) > 0;
      return { id: row.id, name: row.name, description: row.description || "", variant: row.variant || undefined, image: row.image_url || undefined, allergens: row.allergens || [], category: row.category, price: Number(row.price_cents), active: Boolean(row.active), stockTracked: Boolean(row.stock_tracked), availableChannels: row.available_channels || [], availableSchedule: row.available_schedule || {}, stockAvailable, config: row.config || {} };
    })
  };
}

function channelAvailable(item: { active: boolean; availableChannels?: OrderChannel[]; availableSchedule?: unknown }, channel: OrderChannel) {
  return item.active && (!item.availableChannels?.length || item.availableChannels.includes(channel)) && scheduleAllows(item.availableSchedule);
}

export async function priceItemsWithRuntime(db: any, items: CartItem[], channel: OrderChannel, allowReward = false): Promise<{ items: CartItem[]; subtotal: number; menu: RuntimeMenu }> {
  const menu = await loadRuntimeMenu(db);
  const activeCategories = new Set(menu.categories.filter(category => category.active).map(category => category.id));
  const flavors = menu.flavors.map(flavor => ({ ...flavor, active: channelAvailable(flavor as any, channel) && activeCategories.has(flavor.category) }));
  const addons = menu.addons;
  const products = menu.products.map(product => ({ ...product, active: channelAvailable(product, channel) && product.stockAvailable && activeCategories.has(product.category) }));
  const normalized: CartItem[] = [];
  let subtotal = 0;

  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) throw new Error("Quantidade inválida.");
    const rawSelection = (item.selection || {}) as Record<string, unknown>;
    if (["border","borda","borderId","bordaId"].some(key => key in rawSelection)) throw new Error("Bordas não existem neste sistema.");
    let unitPrice = 0;
    let name = item.name;

    if (item.kind === "reward") {
      if (!allowReward) throw new Error("Recompensa exige autorização operacional.");
      const selection = item.selection as PizzaSelection | undefined;
      if (!selection || !["mozzarella","calabresa-tradicional"].includes(selection.flavorA) || selection.size !== "grande" || selection.flavorB) throw new Error("Recompensa inválida.");
      validatePizzaSelection(selection, flavors, addons);
      unitPrice = addonPrice(selection.addons, addons, selection.addonPlacements || {});
      const flavor = flavors.find(row => row.id === selection.flavorA)!;
      name = `Recompensa • Pizza Grande ${flavor.name}`;
    } else if (item.kind === "pizza") {
      const selection = item.selection as SweetPizzaSelection | undefined;
      if (!selection) throw new Error("Configuração de pizza inválida.");
      unitPrice = pizzaTotal(selection, flavors, addons);
      const a = flavors.find(row => row.id === selection.flavorA)!;
      const b = selection.flavorB ? flavors.find(row => row.id === selection.flavorB) : undefined;
      const hasSweet = a.category === "sweet" || b?.category === "sweet";
      const cutLabel = hasSweet ? ` • ${selection.cutPreference === "cut" ? "CORTAR" : "NÃO CORTAR"}` : "";
      const baseLabel = hasSweet && selection.sweetBase === "hazelnut-zero" ? " • Base Avelã Zero" : "";
      name = `Pizza ${selection.size === "grande" ? "Grande" : "Broto"} • ${a.name}${b ? ` / ${b.name}` : ""}${cutLabel}${baseLabel}`;
    } else if (item.kind === "combo") {
      const selection = item.selection as ComboSelectionWithSweetCut | undefined;
      const comboId = item.productId || catalog.combo.id;
      const combo = products.find(product => product.id === comboId && product.category === "combo");
      if (!selection || !combo?.active) throw new Error("Combo inválido ou indisponível.");

      const config = (combo.config || {}) as { grandeFlavors?: unknown; beverages?: unknown; sweetFlavor?: unknown };
      const configuredFlavorIds = Array.isArray(config.grandeFlavors) ? config.grandeFlavors.filter((value): value is string => typeof value === "string") : catalog.combo.options.grandeFlavors;
      const allowedFlavorIds = comboId === catalog.combo.id ? [...OFFICIAL_PROMO_FLAVORS] : configuredFlavorIds;
      const allowedBeverageIds = Array.isArray(config.beverages) ? config.beverages.filter((value): value is string => typeof value === "string") : catalog.combo.options.beverages;
      const sweetFlavorId = typeof config.sweetFlavor === "string" ? config.sweetFlavor : catalog.combo.options.sweetFlavor;

      if (!allowedFlavorIds.includes(selection.grandeFlavor) || (selection.grandeFlavorB && !allowedFlavorIds.includes(selection.grandeFlavorB))) throw new Error("Sabor não permitido nesta promoção.");
      if (!allowedBeverageIds.includes(selection.beverage)) throw new Error("Bebida não permitida neste combo.");

      const beverage = products.find(product => product.id === selection.beverage && product.category === "beverages");
      if (!beverage?.active) throw new Error("Bebida do combo indisponível.");
      const grande = flavors.find(flavor => flavor.id === selection.grandeFlavor);
      const grandeB = selection.grandeFlavorB ? flavors.find(flavor => flavor.id === selection.grandeFlavorB) : undefined;
      const sweet = flavors.find(flavor => flavor.id === sweetFlavorId);
      if (!grande?.active || (selection.grandeFlavorB && !grandeB?.active) || !sweet?.active) throw new Error("Um dos sabores do combo está indisponível.");
      unitPrice = comboTotal(selection, addons, combo.price, allowedBeverageIds);
      const sweetCutLabel = selection.sweetCutPreference === "cut" ? "Broto CORTAR" : "Broto NÃO CORTAR";
      name = `${combo.name} • ${grande.name}${grandeB ? ` / ${grandeB.name}` : ""} • ${sweetCutLabel}`;
    } else {
      const product = products.find(row => row.id === item.productId && row.category !== "combo");
      if (!product?.active) throw new Error("Produto inválido, esgotado ou indisponível.");
      unitPrice = product.price;
      name = product.name;
    }

    normalized.push({ ...item, name, unitPrice });
    subtotal += unitPrice * item.quantity;
  }
  return { items: normalized, subtotal, menu };
}
