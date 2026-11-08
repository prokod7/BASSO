import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadRuntimeMenu, scheduleAllows } from "@/lib/server-menu-pricing";
import { loadActivePromotions,bestProductPromotion } from "@/lib/promotions";
import type { OrderChannel, PromotionTarget } from "@/types";

const publicChannels: OrderChannel[] = ["own_delivery", "pickup", "table_qr"];

type PublicPromotionTarget = PromotionTarget & { label: string };

export async function GET(request: NextRequest) {
  try {
    const rawChannel = request.nextUrl.searchParams.get("channel") as OrderChannel | null;
    const channel = rawChannel && publicChannels.includes(rawChannel) ? rawChannel : "own_delivery";
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });

    const [menu, activePromotions] = await Promise.all([
      loadRuntimeMenu(db),
      loadActivePromotions(db, channel),
    ]);
    const activeCategories = new Set(menu.categories.filter(category => category.active).map(category => category.id));
    const allowed = (item: { active: boolean; availableChannels?: string[]; availableSchedule?: unknown }) =>
      item.active &&
      (!item.availableChannels?.length || item.availableChannels.includes(channel)) &&
      scheduleAllows(item.availableSchedule);

    const visibleFlavors = menu.flavors.filter(flavor => allowed(flavor) && activeCategories.has(flavor.category));
    const visibleProducts = menu.products.filter(
      product => allowed(product) && product.stockAvailable && activeCategories.has(product.category),
    );
    const visibleFlavorIds = new Set(visibleFlavors.map(flavor => flavor.id));
    const visibleProductIds = new Set(visibleProducts.map(product => product.id));
    const availableBeverageIds = new Set(
      visibleProducts.filter(product => product.category === "beverages").map(product => product.id),
    );

    const products = visibleProducts.flatMap(product => {
      if (product.category !== "combo") return [product];
      const config = product.config && typeof product.config === "object" ? product.config : {};
      const configuredBeverages = Array.isArray(config.beverages)
        ? config.beverages.filter((id): id is string => typeof id === "string")
        : [];
      if (!configuredBeverages.length) return [product];

      const savoryIds=Array.isArray(config.grandeFlavors)?config.grandeFlavors:[];
      const sweetIds=Array.isArray(config.sweetFlavors)?config.sweetFlavors:[config.sweetFlavor];
      if(!savoryIds.some(id=>typeof id==="string"&&visibleFlavorIds.has(id)) || !sweetIds.some(id=>typeof id==="string"&&visibleFlavorIds.has(id)))return [];
      const beverages = configuredBeverages.filter(id => availableBeverageIds.has(id));
      if (!beverages.length) return [];
      return [{ ...product, config: { ...config, beverages } }];
    });

    const pricedProducts=products.map(product=>{const promotion=product.category!=="combo"?bestProductPromotion(activePromotions,product.id,product.price):undefined;return promotion?{...product,price:promotion.promoUnitPrice}:product});
    const productName = new Map(visibleProducts.map(product => [product.id, product.name]));
    const flavorName = new Map(visibleFlavors.map(flavor => [flavor.id, flavor.name]));
    const promotions = activePromotions.flatMap(promotion => {
      const targets: PublicPromotionTarget[] = [];
      for (const target of promotion.targets) {
        if (target.productId && visibleProductIds.has(target.productId)) {
          targets.push({ id: target.id, productId: target.productId, label: productName.get(target.productId) || target.productId });
          continue;
        }
        if (target.flavorId && visibleFlavorIds.has(target.flavorId)) {
          targets.push({ id: target.id, flavorId: target.flavorId, label: flavorName.get(target.flavorId) || target.flavorId });
        }
      }
      if (!targets.length) return [];
      return [{
        id: promotion.id,
        name: promotion.name,
        description: promotion.description,
        badgeText: promotion.badgeText,
        image: promotion.image,
        promoPrice: promotion.promoPrice,
        pizzaSize: promotion.pizzaSize,
        targets,
      }];
    });

    return NextResponse.json(
      {
        channel,
        generatedAt: new Date().toISOString(),
        categories: menu.categories.filter(category => category.active),
        flavors: visibleFlavors,
        pizzaOptions: menu.pizzaOptions,
        addons: menu.addons.filter(addon => addon.active),
        products:pricedProducts,
        promotions,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao carregar cardápio." },
      { status: 400 },
    );
  }
}

