import { NextRequest, NextResponse } from "next/server";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadPromotions, promotionRuntimeStatus } from "@/lib/promotions";
import { promotionDbValues, promotionInputSchema, replacePromotionTargets } from "@/lib/promotion-admin";

async function withLabels(db: any) {
  const promotions = await loadPromotions(db);
  const productIds = [...new Set(promotions.flatMap(p => p.targets.flatMap(t => t.productId ? [t.productId] : [])))];
  const flavorIds = [...new Set(promotions.flatMap(p => p.targets.flatMap(t => t.flavorId ? [t.flavorId] : [])))];
  const [productsResult, flavorsResult] = await Promise.all([
    productIds.length ? db.from("products").select("id,name,price_cents,category").in("id", productIds) : Promise.resolve({ data: [], error: null }),
    flavorIds.length ? db.from("pizza_flavors").select("id,name,price_grande_cents,price_broto_cents").in("id", flavorIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (productsResult.error) throw productsResult.error;
  if (flavorsResult.error) throw flavorsResult.error;
  const productMap = new Map((productsResult.data || []).map((row: any) => [row.id, row]));
  const flavorMap = new Map((flavorsResult.data || []).map((row: any) => [row.id, row]));
  return promotions.map(promotion => ({
    ...promotion,
    status: promotionRuntimeStatus(promotion),
    targets: promotion.targets.map(target => {
      const product = target.productId ? productMap.get(target.productId) as any : undefined;
      const flavor = target.flavorId ? flavorMap.get(target.flavorId) as any : undefined;
      return {
        ...target,
        label: product?.name || flavor?.name || target.productId || target.flavorId,
        originalPrice: product ? Number(product.price_cents || 0) : undefined,
        originalGrandePrice: flavor ? Number(flavor.price_grande_cents || 0) : undefined,
        originalBrotoPrice: flavor ? Number(flavor.price_broto_cents || 0) : undefined,
      };
    }),
  }));
}

export async function GET() {
  try {
    await requireOperationalRole(["manager"], "menu.manage");
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    return NextResponse.json({ promotions: await withLabels(db) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao carregar promoções." }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOperationalRole(["manager"], "menu.manage");
    const input = promotionInputSchema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const actorId = auth.userId === "demo" ? null : auth.userId;

    const { data: created, error } = await db.from("promotions").insert({
      ...promotionDbValues(input, actorId),
      created_by: actorId,
    }).select("id").single();
    if (error) throw error;

    try {
      await replacePromotionTargets(db, created.id, input.productIds, input.flavorIds);
    } catch (targetError) {
      await db.from("promotions").delete().eq("id", created.id);
      throw targetError;
    }

    await db.from("audit_logs").insert({
      actor_id: actorId,
      actor_label: auth.displayName,
      action: "PROMOTION_CREATED",
      entity_type: "promotion",
      entity_id: created.id,
      after_data: input,
    });

    const promotions = await withLabels(db);
    return NextResponse.json({ promotion: promotions.find(item => item.id === created.id) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao criar promoção." }, { status: 400 });
  }
}
