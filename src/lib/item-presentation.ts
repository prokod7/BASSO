import { massName, pizzaOptions } from "@/lib/pizza-options";
import { findAddon, findFlavor, findProduct } from "@/lib/catalog";
import type { CartItem } from "@/types";

type Detail = { text: string; emphasis?: boolean };
export function compactItemName(item: Pick<CartItem, "kind" | "name" | "selection">) {
  const s = item.selection;
  if ((item.kind === "pizza" || item.kind === "reward") && s && "flavorA" in s)
    return `${item.kind === "reward" ? "Recompensa • " : ""}Pizza ${s.size === "broto" ? "Broto" : "Grande"}`;
  return item.name;
}

// Used by the order panel, customer receipt and both browser print paths.
export function itemDetails(item: Pick<CartItem, "selection">): Detail[] {
  const s = (item.selection || {}) as Record<string, any>;
  const names = s.labels || {};
  const flavor = (id: string) => names[id] || findFlavor(id)?.name || id?.replaceAll("-", " ") || "";
  const addon = (id: string) => names[id] || findAddon(id)?.name || id.replaceAll("-", " ");
  const lines: Detail[] = [];
  if (s.mass) lines.push({ text: `Massa: ${massName(s.mass)}` });
  const a = s.flavorA || s.grandeFlavor, b = s.flavorB || s.grandeFlavorB;
  const extras = (place: string) => {
    for (const [id, qty] of Object.entries(s.addons || {})) {
      if (Number(qty) > 0 && (s.addonPlacements?.[id] || "whole") === place)
        lines.push({ text: `  + ${qty}x ${addon(id)}${place === "whole" && b ? " • pizza inteira" : ""}`, emphasis: true });
    }
  };
  const part = (id: string, removed: unknown, place: string) => {
    lines.push({ text: `${b ? "½ " : ""}${flavor(id)}`, emphasis: true });
    if (Array.isArray(removed) && removed.length)
      lines.push({ text: `  SEM ${removed.filter(x => typeof x === "string").join(", ")}`, emphasis: true });
    extras(place);
  };
  if (a) part(a, s.removedA, "halfA");
  if (b) part(b, s.removedB, "halfB");
  extras("whole");
  if (s.secondGrandeFlavor) lines.push({ text: `Grande 2: ${flavor(s.secondGrandeFlavor)}${s.secondGrandeFlavorB ? ` / ${flavor(s.secondGrandeFlavorB)}` : ""}`, emphasis: true });
  if (s.sweetFlavor) lines.push({ text: `${s.sweetSize === "grande" ? "Grande" : "Broto"} doce: ${flavor(s.sweetFlavor)}`, emphasis: true });
  if (s.beverage) lines.push({ text: `Bebida: ${names[s.beverage] || findProduct(s.beverage)?.name || s.beverage.replaceAll("-", " ")}` });
  if (s.sweetBase === "hazelnut-zero") lines.push({ text: `Base: ${pizzaOptions().hazelnut.name}`, emphasis: true });
  const cut = s.cutPreference || s.sweetCutPreference;
  if (cut === "cut" || cut === "uncut") lines.push({ text: cut === "cut" ? "CORTAR" : "NÃO CORTAR", emphasis: true });
  if (typeof s.notes === "string" && s.notes.trim()) lines.push({ text: `OBS: ${s.notes.trim()}`, emphasis: true });
  return lines;
}
