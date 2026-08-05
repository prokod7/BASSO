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
    const allowed = (item: any) => item.active && (!item.availableChannels?.length || item.availableChannels.includes(channel)) && scheduleAllows(item.availableSchedule);
    return NextResponse.json({
      channel,
      generatedAt: new Date().toISOString(),
      flavors: menu.flavors.filter(allowed),
      addons: menu.addons.filter(addon => addon.active),
      products: menu.products.filter(product => allowed(product) && product.stockAvailable)
    }, { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao carregar cardápio." }, { status: 400 });
  }
}
