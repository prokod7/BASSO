import { z } from "zod";
import type { ComboSelection, Flavor, Addon } from "@/types";
import { addonPrice, comboTotal, PricingError } from "@/lib/pricing";

export const comboConfigSchema = z.object({
  grandeFlavors: z.array(z.string().min(1)).min(1).max(150),
  beverages: z.array(z.string().min(1)).min(1).max(100),
  sweetFlavor: z.string().min(1).default("brigadeiro"),
  sweetFlavors: z.array(z.string().min(1)).min(1).max(100).optional(),
  grandeQuantity: z.number().int().min(1).max(2).default(1),
  sweetSize: z.enum(["broto", "grande"]).default("broto"),
  allowHalfHalf: z.boolean().default(true),
  masses: z
    .array(z.enum(["traditional", "integral"]))
    .min(1)
    .default(["traditional", "integral"]),
});
export type ComboConfig = z.infer<typeof comboConfigSchema>;
export function comboConfig(raw: unknown): ComboConfig {
  return comboConfigSchema.parse(raw);
}
export function priceConfiguredCombo(
  selection: ComboSelection,
  config: ComboConfig,
  price: number,
  flavors: Flavor[],
  addons: Addon[],
) {
  const assertFlavor = (
    id: string | undefined,
    allowed: string[],
    sweet: boolean,
  ) => {
    const flavor = flavors.find((f) => f.id === id && f.active);
    if (
      !flavor ||
      !allowed.includes(flavor.id) ||
      (sweet ? flavor.category !== "sweet" : flavor.category === "sweet")
    )
      throw new PricingError("Sabor inválido ou indisponível para este combo.");
    return flavor;
  };
  if (!config.masses.includes(selection.mass))
    throw new PricingError("Massa indisponível neste combo.");
  const first = assertFlavor(
    selection.grandeFlavor,
    config.grandeFlavors,
    false,
  );
  if (selection.grandeFlavorB) {
    if (!config.allowHalfHalf)
      throw new PricingError("Este combo permite somente pizza inteira.");
    assertFlavor(selection.grandeFlavorB, config.grandeFlavors, false);
    if (first.id === selection.grandeFlavorB)
      throw new PricingError("Escolha sabores diferentes.");
  }
  if (config.grandeQuantity === 2) {
    const second = assertFlavor(
      selection.secondGrandeFlavor,
      config.grandeFlavors,
      false,
    );
    if (selection.secondGrandeFlavorB) {
      if (!config.allowHalfHalf)
        throw new PricingError("Este combo permite somente pizza inteira.");
      assertFlavor(selection.secondGrandeFlavorB, config.grandeFlavors, false);
      if (second.id === selection.secondGrandeFlavorB)
        throw new PricingError("Escolha sabores diferentes.");
    }
  } else if (selection.secondGrandeFlavor || selection.secondGrandeFlavorB)
    throw new PricingError("Este combo inclui uma pizza salgada.");
  const sweet = assertFlavor(
    selection.sweetFlavor || config.sweetFlavor,
    config.sweetFlavors || [config.sweetFlavor],
    true,
  );
  if (selection.sweetSize && selection.sweetSize !== config.sweetSize)
    throw new PricingError("Tamanho doce inválido para este combo.");
  for (const [id, placement] of Object.entries(
    selection.addonPlacements || {},
  )) {
    if (
      !(id in selection.addons) ||
      !["whole", "halfA", "halfB"].includes(placement) ||
      (placement === "halfB" && !selection.grandeFlavorB)
    )
      throw new PricingError("Posicionamento de adicional inválido.");
  }
  if (typeof selection.notes !== "string" || selection.notes.length > 500)
    throw new PricingError("Observação inválida.");
  const total = comboTotal(selection, addons, price, config.beverages, flavors);
  // Check addon availability even for a configured zero-price combo.
  addonPrice(selection.addons, addons, selection.addonPlacements || {});
  const label = (a?: string, b?: string) =>
    [a, b]
      .filter(Boolean)
      .map((id) => flavors.find((f) => f.id === id)?.name)
      .join(" / ");
  const details = [
    `Grande 1: ${label(selection.grandeFlavor, selection.grandeFlavorB)}`,
  ];
  if (config.grandeQuantity === 2)
    details.push(
      `Grande 2: ${label(selection.secondGrandeFlavor, selection.secondGrandeFlavorB)}`,
    );
  details.push(
    `${config.sweetSize === "broto" ? "Broto" : "Grande"} doce: ${sweet.name} • ${selection.sweetCutPreference === "cut" ? "CORTAR" : "NÃO CORTAR"}`,
  );
  return {
    total,
    details: details.join(" • "),
    sweetFlavor: sweet.id,
    sweetSize: config.sweetSize,
  };
}
