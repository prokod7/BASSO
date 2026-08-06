import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createHash, randomBytes } from "crypto";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("authorize"), customerId: z.string().uuid(), flavorId: z.enum(["mozzarella", "calabresa-tradicional"]) }),
  z.object({ action: z.literal("cancel"), authorizationId: z.string().uuid(), reason: z.string().min(2).max(500) })
]);

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOperationalRole(["manager", "counter"], "loyalty.authorize");
    const body = schema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const actorId = auth.userId === "demo" ? null : auth.userId;
    if (body.action === "cancel") {
      const { data, error } = await db.rpc("cancel_loyalty_reward_authorization", { p_authorization_id: body.authorizationId, p_reason: body.reason, p_actor_id: actorId, p_expired: false });
      if (error) throw error;
      return NextResponse.json({ cancelled: true, balance: data });
    }
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 4 * 60 * 60_000).toISOString();
    const { data, error } = await db.rpc("authorize_loyalty_reward", { p_customer_id: body.customerId, p_flavor_id: body.flavorId, p_token_hash: tokenHash, p_expires_at: expiresAt, p_actor_id: actorId });
    if (error) throw error;
    return NextResponse.json({ authorizationId: data, token, flavorId: body.flavorId, expiresAt, pointsConsumed: 10 }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao autorizar recompensa." }, { status: 400 });
  }
}
