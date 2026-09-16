import { NextResponse } from "next/server";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadRuntimeMenu, scheduleAllows } from "@/lib/server-menu-pricing";

export async function GET() {
  try {
    await requireOperationalRole(["manager", "counter", "waiter"], "orders.view");
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const menu = await loadRuntimeMenu(db);
    const categoryIds = new Set(menu.categories.filter(category => category.active).map(category => category.id));
    const allowed = (item: { active: boolean; availableChannels?: string[]; availableSchedule?: unknown }) =>
      item.active &&
      (!item.availableChannels?.length || item.availableChannels.includes("dine_in")) &&
      scheduleAllows(item.availableSchedule);

    return NextResponse.json({
      categories: menu.categories.filter(category => category.active),
      flavors: menu.flavors.filter(flavor => allowed(flavor) && categoryIds.has(flavor.category)),
      addons: menu.addons.filter(addon => addon.active),
      products: menu.products.filter(product => allowed(product) && product.stockAvailable && categoryIds.has(product.category) && product.category !== "combo"),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao carregar cardápio do garçom." }, { status: 400 });
  }
}