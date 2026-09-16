import { z } from "zod";
import type { OrderChannel } from "@/types";

export const promotionChannels = ["own_delivery", "pickup", "counter", "dine_in", "table_qr"] as const satisfies readonly OrderChannel[];

const promotionBaseSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).default(""),
  badgeText: z.string().trim().min(2).max(60).default("Promoção do dia"),
  promoPrice: z.number().int().nonnegative(),
  active: z.boolean().default(true),
  paused: z.boolean().default(false),
  channels: z.array(z.enum(promotionChannels)).min(1).default([...promotionChannels]),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).max(7).transform(values => [...new Set(values)].sort()),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  pizzaSize: z.enum(["grande", "broto"]).optional().nullable(),
  allowCouponStack: z.boolean().default(false),
  sortOrder: z.number().int().min(-9999).max(9999).default(0),
  productIds: z.array(z.string().min(1)).max(100).default([]),
  flavorIds: z.array(z.string().min(1)).max(100).default([]),
});

function validatePromotion(value: z.infer<typeof promotionBaseSchema>, ctx: z.RefinementCtx) {
  if (!value.productIds.length && !value.flavorIds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["productIds"], message: "Selecione pelo menos um produto ou sabor." });
  }
  if (value.startsOn && value.endsOn && value.startsOn > value.endsOn) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endsOn"], message: "A data final deve ser igual ou posterior à inicial." });
  }
}

export const promotionInputSchema = promotionBaseSchema.superRefine(validatePromotion);
export const promotionPatchSchema = promotionBaseSchema.partial();

export type PromotionInput = z.infer<typeof promotionInputSchema>;

export function promotionDbValues(input: PromotionInput, actorId?: string | null) {
  return {
    name: input.name,
    description: input.description,
    badge_text: input.badgeText,
    promo_price_cents: input.promoPrice,
    active: input.active,
    paused: input.paused,
    channels: input.channels,
    days_of_week: input.daysOfWeek,
    starts_on: input.startsOn || null,
    ends_on: input.endsOn || null,
    start_time: input.startTime || null,
    end_time: input.endTime || null,
    pizza_size: input.pizzaSize || null,
    allow_coupon_stack: input.allowCouponStack,
    sort_order: input.sortOrder,
    updated_by: actorId || null,
    updated_at: new Date().toISOString(),
  };
}

export async function validatePromotionTargets(db: any, productIds: string[], flavorIds: string[]) {
  const uniqueProducts = [...new Set(productIds)];
  const uniqueFlavors = [...new Set(flavorIds)];
  const [productsResult, flavorsResult] = await Promise.all([
    uniqueProducts.length
      ? db.from("products").select("id,name,category").in("id", uniqueProducts).is("deleted_at", null)
      : Promise.resolve({ data: [], error: null }),
    uniqueFlavors.length
      ? db.from("pizza_flavors").select("id,name").in("id", uniqueFlavors)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (productsResult.error) throw productsResult.error;
  if (flavorsResult.error) throw flavorsResult.error;

  const products = productsResult.data || [];
  const flavors = flavorsResult.data || [];
  if (products.length !== uniqueProducts.length) throw new Error("Um ou mais produtos selecionados não existem mais.");
  if (flavors.length !== uniqueFlavors.length) throw new Error("Um ou mais sabores selecionados não existem mais.");
  if (products.some((product: any) => product.category === "combo")) {
    throw new Error("Combos possuem regras próprias e não podem receber esta promoção genérica. Use produtos ou sabores de pizza.");
  }
  return { products, flavors, productIds: uniqueProducts, flavorIds: uniqueFlavors };
}

export async function replacePromotionTargets(db: any, promotionId: string, productIds: string[], flavorIds: string[]) {
  const validated = await validatePromotionTargets(db, productIds, flavorIds);
  const { error: deleteError } = await db.from("promotion_targets").delete().eq("promotion_id", promotionId);
  if (deleteError) throw deleteError;
  const rows = [
    ...validated.productIds.map(productId => ({ promotion_id: promotionId, product_id: productId })),
    ...validated.flavorIds.map(flavorId => ({ promotion_id: promotionId, flavor_id: flavorId })),
  ];
  if (rows.length) {
    const { error } = await db.from("promotion_targets").insert(rows);
    if (error) throw error;
  }
  return validated;
}
