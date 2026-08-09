import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

const createSchema = z.object({ name: z.string().trim().min(2).max(120) });
const restoreSchema = z.object({ id: z.string().uuid() });

export async function GET() {
  try {
    await requireOperationalRole(["manager", "viewer"]);
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { data, error } = await db.from("configuration_snapshots").select("id,name,scope,created_by_label,created_at,restored_at").order("created_at", { ascending: false }).limit(50);
    if (error) throw error;
    return NextResponse.json({ snapshots: data || [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao listar snapshots." }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOperationalRole(["manager"], "settings.manage");
    const body = createSchema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const [settingsR, zonesR, runtimeR, flagsR] = await Promise.all([
      db.from("business_settings").select("*").order("created_at").limit(1).single(),
      db.from("delivery_zones").select("*").order("name"),
      db.from("store_runtime_status").select("*").eq("id", true).single(),
      db.from("feature_flags").select("key,enabled,config").order("key"),
    ]);
    const failed = [settingsR, zonesR, runtimeR, flagsR].find((result) => result.error);
    if (failed?.error) throw failed.error;
    const payload = { settings: settingsR.data, deliveryZones: zonesR.data || [], runtime: runtimeR.data, featureFlags: flagsR.data || [] };
    const { data, error } = await db.from("configuration_snapshots").insert({ name: body.name, payload, created_by: auth.userId === "demo" ? null : auth.userId, created_by_label: auth.displayName }).select("id,created_at").single();
    if (error) throw error;
    await db.from("audit_logs").insert({ actor_id: auth.userId === "demo" ? null : auth.userId, actor_label: auth.displayName, action: "CONFIGURATION_SNAPSHOT_CREATED", entity_type: "configuration_snapshot", entity_id: data.id, after_data: { name: body.name } });
    return NextResponse.json({ snapshot: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao criar snapshot." }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireOperationalRole(["manager"], "settings.manage");
    const body = restoreSchema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { data: snapshot, error } = await db.from("configuration_snapshots").select("*").eq("id", body.id).single();
    if (error) throw error;
    const payload = snapshot.payload as { settings?: Record<string, unknown>; runtime?: Record<string, unknown>; featureFlags?: Array<{ key: string; enabled: boolean; config?: Record<string, unknown> }> };
    if (!payload.settings?.id) throw new Error("Snapshot não contém configurações restauráveis.");
    const settingsId = String(payload.settings.id);
    const settingsPatch = { ...payload.settings } as Record<string, unknown>;
    delete settingsPatch.id;
    delete settingsPatch.created_at;
    settingsPatch.updated_at = new Date().toISOString();
    const { error: settingsError } = await db.from("business_settings").update(settingsPatch).eq("id", settingsId);
    if (settingsError) throw settingsError;
    if (payload.runtime) {
      const runtimePatch = { ...payload.runtime } as Record<string, unknown>;
      delete runtimePatch.id;
      const { error: runtimeError } = await db.from("store_runtime_status").update({ ...runtimePatch, updated_at: new Date().toISOString() }).eq("id", true);
      if (runtimeError) throw runtimeError;
    }
    for (const flag of payload.featureFlags || []) {
      await db.from("feature_flags").update({ enabled: Boolean(flag.enabled), config: flag.config || {}, updated_by: auth.userId === "demo" ? null : auth.userId, updated_at: new Date().toISOString() }).eq("key", flag.key);
    }
    await db.from("configuration_snapshots").update({ restored_at: new Date().toISOString(), restored_by: auth.userId === "demo" ? null : auth.userId }).eq("id", body.id);
    await db.from("audit_logs").insert({ actor_id: auth.userId === "demo" ? null : auth.userId, actor_label: auth.displayName, action: "CONFIGURATION_SNAPSHOT_RESTORED", entity_type: "configuration_snapshot", entity_id: body.id, reason: "Restauração administrativa" });
    return NextResponse.json({ restored: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao restaurar snapshot." }, { status: 400 });
  }
}
