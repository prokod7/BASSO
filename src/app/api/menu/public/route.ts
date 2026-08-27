import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadRuntimeMenu, scheduleAllows } from "@/lib/server-menu-pricing";
import type { OrderChannel } from "@/types";

const publicChannels: OrderChannel[] = ["own_delivery", "pickup", "table_qr"];

export async function GET(request: NextRequest) {
  try {
    const rawChannel = request.nextUrl.searchParams.get("channel") as OrderChannel | null;
    const channel = rawChannel && publicChannels.includes(rawChannel) ? rawChannel : "own_delivery";
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });

    const menu = await loadRuntimeMenu(db);
    const activeCategories = new Set(menu.categories.filter(category => category.active).map(category => category.id));
    const allowed = (item: { active: boolean; availableChannels?: string[]; availableSchedule?: unknown }) =>
      item.active &&
      (!item.availableChannels?.length || item.availableChannels.includes(channel)) &&
      scheduleAllows(item.availableSchedule);

    const visibleProducts = menu.products.filter(
      product => allowed(product) && product.stockAvailable && activeCategories.has(product.category),
    );
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

      const beverages = configuredBeverages.filter(id => availableBeverageIds.has(id));
      if (!beverages.length) return [];
      return [{ ...product, config: { ...config, beverages } }];
    });

    return NextResponse.json(
      {
        channel,
        generatedAt: new Date().toISOString(),
        categories: menu.categories.filter(category => category.active),
        flavors: menu.flavors.filter(flavor => allowed(flavor) && activeCategories.has(flavor.category)),
        addons: menu.addons.filter(addon => addon.active),
        products,
      },
      { headers: { "Cache-Control": "public, max-age=15, stale-while-revalidate=30" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao carregar cardápio." },
      { status: 400 },
    );
  }
}
