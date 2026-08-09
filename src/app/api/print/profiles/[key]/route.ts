import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  name: z.string().min(2).max(120).optional(),
  manufacturer: z.string().max(120).nullable().optional(),
  model: z.string().max(160).nullable().optional(),
  widthMm: z.union([z.literal(58), z.literal(80)]).optional(),
  paperColumns: z.number().int().min(24).max(64).optional(),
  connectionType: z.enum(["usb", "network", "wifi", "bluetooth", "system"]).optional(),
  connectionConfig: z.record(z.unknown()).optional(),
  sector: z.string().min(2).max(80).optional(),
  autoPrint: z.boolean().optional(),
  copies: z.number().int().min(1).max(5).optional(),
  active: z.boolean().optional(),
  template: z.record(z.unknown()).optional(),
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ key: string }> }) {
  try {
    const auth = await requireOperationalRole(["manager"], "print.manage");
    const { key } = await context.params;
    const body = schema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { data: current, error: currentError } = await db.from("print_profiles").select("*").eq("key", key).single();
    if (currentError) throw currentError;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: auth.userId === "demo" ? null : auth.userId };
    if (body.name !== undefined) patch.name = body.name.trim();
    if (body.manufacturer !== undefined) patch.manufacturer = body.manufacturer;
    if (body.model !== undefined) patch.model = body.model;
    if (body.widthMm !== undefined) patch.width_mm = body.widthMm;
    if (body.paperColumns !== undefined) patch.paper_columns = body.paperColumns;
    if (body.connectionType !== undefined) patch.connection_type = body.connectionType;
    if (body.connectionConfig !== undefined) patch.connection_config = body.connectionConfig;
    if (body.sector !== undefined) patch.sector = body.sector;
    if (body.autoPrint !== undefined) patch.auto_print = body.autoPrint;
    if (body.copies !== undefined) patch.copies = body.copies;
    if (body.active !== undefined) patch.active = body.active;
    if (body.template !== undefined) patch.template = { ...(current.template || {}), ...body.template };
    const { error } = await db.from("print_profiles").update(patch).eq("key", key);
    if (error) throw error;
    await db.from("audit_logs").insert({ actor_id: auth.userId === "demo" ? null : auth.userId, actor_label: auth.displayName, action: "PRINT_PROFILE_UPDATED", entity_type: "print_profile", entity_id: key, before_data: current, after_data: patch });
    return NextResponse.json({ updated: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao atualizar perfil de impressão." }, { status: 400 });
  }
}
