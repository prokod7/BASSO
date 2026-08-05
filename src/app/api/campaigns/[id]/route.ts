import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { queueCampaignById } from "@/lib/campaigns";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("schedule"), scheduledAt: z.string().datetime() }),
  z.object({ action: z.literal("cancel"), reason: z.string().min(2).max(500) }),
  z.object({ action: z.literal("run") })
]);

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireOperationalRole(["manager"]);
    const { id } = await params;
    const body = schema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { data: campaign, error: campaignError } = await db.from("campaigns").select("*").eq("id", id).single();
    if (campaignError) throw campaignError;
    const actorId = auth.userId === "demo" ? null : auth.userId;

    if (body.action === "schedule") {
      const { error } = await db.from("campaigns").update({ status: "scheduled", scheduled_at: body.scheduledAt, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      return NextResponse.json({ id, status: "scheduled" });
    }
    if (body.action === "cancel") {
      const { error } = await db.from("campaigns").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      await db.from("audit_logs").insert({ actor_id: actorId, actor_label: auth.displayName, action: "CAMPAIGN_CANCELLED", entity_type: "campaign", entity_id: id, reason: body.reason });
      return NextResponse.json({ id, status: "cancelled" });
    }

    const queued = await queueCampaignById(id, { id: actorId, label: auth.displayName });
    return NextResponse.json(queued);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao processar campanha." }, { status: 400 });
  }
}
