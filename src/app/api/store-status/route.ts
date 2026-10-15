import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapStoreRuntime } from "@/lib/admin-control";
import { loadBusinessSettings } from "@/lib/business-settings";
import type { OpeningHours } from "@/lib/opening-hours";
import { storeStatus } from "@/lib/opening-hours";

const schema = z.object({
  operationalStatus: z.enum(["open", "paused", "closed"]),
  acceptingOrders: z.boolean(),
  pauseReason: z.string().max(300).nullable().optional(),
  manualOverride: z.boolean().default(true),
  activeChannels: z.array(z.enum(["own_delivery", "pickup", "counter", "dine_in", "table_qr"])).min(1).optional(),
  preparationMinutes: z.number().int().min(5).max(240).optional(),
  deliveryMinutes: z.number().int().min(10).max(300).optional(),
  temporaryUntil: z.string().datetime().nullable().optional(),
  publicMessage: z.string().max(500).nullable().optional(),
});

async function synchronizeRuntime(
  db: NonNullable<ReturnType<typeof createAdminClient>>,
  runtime: Record<string, unknown>,
  hours: OpeningHours,
) {
  const schedule = storeStatus(new Date(),hours);
  let current = runtime;
  const temporaryPauseExpired =
    current.operational_status === "paused" &&
    typeof current.temporary_until === "string" &&
    new Date(current.temporary_until).getTime() <= Date.now();

  if (temporaryPauseExpired) {
    const desiredStatus = schedule.open ? "open" : "closed";
    const { data: resumed, error } = await db
      .from("store_runtime_status")
      .update({
        operational_status: desiredStatus,
        accepting_orders: schedule.open,
        pause_reason: null,
        temporary_until: null,
        manual_override: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", true)
      .select("*")
      .single();
    if (!error && resumed) {
      current = resumed as Record<string, unknown>;
      await db.from("audit_logs").insert({
        actor_label: "Sistema",
        action: "STORE_AUTO_RESUMED",
        entity_type: "store",
        entity_id: "main",
        after_data: { source: "temporary_until", desiredStatus },
      });
    }
  }

  // Sem override manual, a agenda oficial é a fonte de verdade. Assim a loja
  // abre às 18h e fecha às 23h sem depender de uma ação humana no painel.
  if (current.manual_override === false) {
    const desiredStatus = schedule.open ? "open" : "closed";
    const desiredAccepting = schedule.open;
    if (
      current.operational_status !== desiredStatus ||
      current.accepting_orders !== desiredAccepting
    ) {
      const { data: synchronized, error } = await db
        .from("store_runtime_status")
        .update({
          operational_status: desiredStatus,
          accepting_orders: desiredAccepting,
          pause_reason: null,
          temporary_until: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", true)
        .select("*")
        .single();
      if (!error && synchronized) current = synchronized as Record<string, unknown>;
    }
  }

  return { current, schedule };
}

export async function GET() {
  try {
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });

    const [{ data, error }, deliveryZones, business] = await Promise.all([
      db.from("store_runtime_status").select("*").eq("id", true).single(),
      db.from("delivery_zones").select("id", { count: "exact", head: true }).eq("active", true).is("deleted_at",null),
      loadBusinessSettings(db),
    ]);
    if (error) throw error;

    const { current, schedule } = await synchronizeRuntime(db, data as Record<string, unknown>,business.openingHours);
    const deliveryAvailable = !deliveryZones.error && (deliveryZones.count || 0) > 0;

    return NextResponse.json(
      {
        ...mapStoreRuntime(current),
        business,
        scheduledOpen: schedule.open,
        scheduleLabel: schedule.label,
        deliveryAvailable,
        deliveryConfigurationPending: !deliveryAvailable,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao consultar loja." },
      { status: 400 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireOperationalRole(["manager", "counter"], "orders.edit");
    const body = schema.parse(await request.json());
    if (auth.role !== "manager" && body.operationalStatus === "closed") {
      throw new Error("Somente o gestor pode fechar a loja manualmente.");
    }
    if (auth.role !== "manager" && (body.activeChannels || body.temporaryUntil || body.publicMessage)) {
      throw new Error("Somente o gestor pode alterar canais e mensagens públicas.");
    }

    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { data: before, error: beforeError } = await db.from("store_runtime_status").select("*").eq("id", true).single();
    if (beforeError) throw beforeError;

    const patch: Record<string, unknown> = {
      operational_status: body.operationalStatus,
      accepting_orders: body.acceptingOrders,
      pause_reason: body.pauseReason || null,
      manual_override: body.manualOverride,
      updated_by: auth.userId === "demo" ? null : auth.userId,
      updated_at: new Date().toISOString(),
    };
    if (body.activeChannels !== undefined) patch.active_channels = body.activeChannels;
    if (body.preparationMinutes !== undefined) patch.preparation_minutes = body.preparationMinutes;
    if (body.deliveryMinutes !== undefined) patch.delivery_minutes = body.deliveryMinutes;
    if (body.temporaryUntil !== undefined) patch.temporary_until = body.temporaryUntil;
    if (body.publicMessage !== undefined) patch.public_message = body.publicMessage;

    const { data, error } = await db.from("store_runtime_status").update(patch).eq("id", true).select("*").single();
    if (error) throw error;
    await db.from("audit_logs").insert({
      actor_id: auth.userId === "demo" ? null : auth.userId,
      actor_label: auth.displayName,
      action: "STORE_RUNTIME_STATUS_CHANGED",
      entity_type: "store",
      entity_id: "main",
      reason: body.pauseReason || undefined,
      before_data: before,
      after_data: patch,
    });
    return NextResponse.json(mapStoreRuntime(data as Record<string, unknown>));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao alterar a loja." },
      { status: 400 },
    );
  }
}

