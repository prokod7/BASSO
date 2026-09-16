import { NextRequest, NextResponse } from "next/server";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadPromotions, promotionRuntimeStatus } from "@/lib/promotions";
import { promotionDbValues, promotionInputSchema, replacePromotionTargets } from "@/lib/promotion-admin";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireOperationalRole(["manager"], "menu.manage");
    const { id } = await params;
    const patch = await request.json() as Record<string, unknown>;
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });

    const existing = (await loadPromotions(db)).find(item => item.id === id);
    if (!existing) return NextResponse.json({ error: "Promoção não encontrada." }, { status: 404 });
    const input = promotionInputSchema.parse({
      name: existing.name,
      description: existing.description,
      badgeText: existing.badgeText,
      promoPrice: existing.promoPrice,
      active: existing.active,
      paused: existing.paused,
      channels: existing.channels,
      daysOfWeek: existing.daysOfWeek,
      startsOn: existing.startsOn || null,
      endsOn: existing.endsOn || null,
      startTime: existing.startTime || null,
      endTime: existing.endTime || null,
      pizzaSize: existing.pizzaSize || null,
      allowCouponStack: existing.allowCouponStack,
      sortOrder: existing.sortOrder,
      productIds: existing.targets.flatMap(target => target.productId ? [target.productId] : []),
      flavorIds: existing.targets.flatMap(target => target.flavorId ? [target.flavorId] : []),
      ...patch,
    });
    const actorId = auth.userId === "demo" ? null : auth.userId;

    const { error } = await db.from("promotions").update(promotionDbValues(input, actorId)).eq("id", id).is("deleted_at", null);
    if (error) throw error;
    await replacePromotionTargets(db, id, input.productIds, input.flavorIds);

    await db.from("audit_logs").insert({
      actor_id: actorId,
      actor_label: auth.displayName,
      action: input.paused !== existing.paused ? (input.paused ? "PROMOTION_PAUSED" : "PROMOTION_RESUMED") : "PROMOTION_UPDATED",
      entity_type: "promotion",
      entity_id: id,
      before_data: existing,
      after_data: input,
    });

    const updated = (await loadPromotions(db)).find(item => item.id === id);
    return NextResponse.json({ promotion: updated ? { ...updated, status: promotionRuntimeStatus(updated) } : null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao atualizar promoção." }, { status: 400 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireOperationalRole(["manager"], "menu.manage");
    const { id } = await params;
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const existing = (await loadPromotions(db)).find(item => item.id === id);
    if (!existing) return NextResponse.json({ error: "Promoção não encontrada." }, { status: 404 });
    const actorId = auth.userId === "demo" ? null : auth.userId;
    const { error } = await db.from("promotions").update({
      active: false,
      paused: true,
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by: actorId,
    }).eq("id", id);
    if (error) throw error;
    await db.from("audit_logs").insert({
      actor_id: actorId,
      actor_label: auth.displayName,
      action: "PROMOTION_DELETED",
      entity_type: "promotion",
      entity_id: id,
      before_data: existing,
      after_data: { deleted: true },
    });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao excluir promoção." }, { status: 400 });
  }
}
