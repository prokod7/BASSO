import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FeatureFlagRecord } from "@/types";

const patchSchema = z.object({
  key: z.string().min(2).max(80),
  enabled: z.boolean(),
  config: z.record(z.string(), z.unknown()).optional(),
});

function mapFlag(row: Record<string, unknown>): FeatureFlagRecord {
  return {
    key: String(row.key),
    label: String(row.label),
    description: String(row.description || ""),
    enabled: Boolean(row.enabled),
    requiresIntegration: Boolean(row.requires_integration),
    config: row.config && typeof row.config === "object" ? row.config as Record<string, unknown> : {},
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

export async function GET() {
  try {
    await requireOperationalRole(["manager", "viewer"]);
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { data, error } = await db.from("feature_flags").select("*").order("requires_integration").order("label");
    if (error) throw error;
    return NextResponse.json({ flags: (data || []).map((row: any) => mapFlag(row as Record<string, unknown>)) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao carregar recursos." }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireOperationalRole(["manager"], "settings.manage");
    const body = patchSchema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { data: before, error: beforeError } = await db.from("feature_flags").select("*").eq("key", body.key).single();
    if (beforeError) throw beforeError;
    const patch = {
      enabled: body.enabled,
      config: body.config ?? before.config ?? {},
      updated_by: auth.userId === "demo" ? null : auth.userId,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await db.from("feature_flags").update(patch).eq("key", body.key).select("*").single();
    if (error) throw error;
    await db.from("audit_logs").insert({
      actor_id: auth.userId === "demo" ? null : auth.userId,
      actor_label: auth.displayName,
      action: "FEATURE_FLAG_UPDATED",
      entity_type: "feature_flag",
      entity_id: body.key,
      before_data: before,
      after_data: data,
    });
    return NextResponse.json({ flag: mapFlag(data as Record<string, unknown>) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao atualizar recurso." }, { status: 400 });
  }
}
