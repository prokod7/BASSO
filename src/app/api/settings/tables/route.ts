import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { MAX_TABLE_NUMBER } from "@/lib/tables";

const MIGRATION_HINT = "Para cadastrar mais mesas, aplique a migration 041_configurable_restaurant_tables.sql no Supabase.";

function friendly(error: unknown) {
  const message = error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : String((error as { message?: string })?.message || "");
  if (/restaurant_tables_(number|capacity)_check|column .*active.* does not exist/i.test(message || "")) return MIGRATION_HINT;
  if (/duplicate key|restaurant_tables_pkey/i.test(message || "")) return "Já existe uma mesa com esse número.";
  return message || "Falha ao atualizar mesas.";
}

/** Lista todas as mesas, inclusive as desativadas. */
export async function GET() {
  try {
    await requireOperationalRole(["manager", "counter"], "settings.manage");
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { data, error } = await db.from("restaurant_tables").select("*").order("number");
    if (error) throw error;
    const tables = (data || []).map((row: Record<string, unknown>) => ({ number: Number(row.number), capacity: Number(row.capacity), status: String(row.status || "free"), active: row.active !== false }));
    return NextResponse.json({ tables, migrationApplied: (data || []).some((row: Record<string, unknown>) => "active" in row) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: friendly(error) }, { status: 400 });
  }
}

const createSchema = z.object({
  number: z.number().int().min(1, "Número da mesa inválido.").max(MAX_TABLE_NUMBER, `Use números de 1 a ${MAX_TABLE_NUMBER}.`),
  capacity: z.number().int().min(1, "Informe ao menos 1 lugar.").max(50, "Máximo de 50 lugares por mesa."),
});

/** Cadastra uma mesa nova (ou reativa uma desativada com o mesmo número). */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireOperationalRole(["manager"], "settings.manage");
    const body = createSchema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { data: existing } = await db.from("restaurant_tables").select("*").eq("number", body.number).maybeSingle();
    if (existing && existing.active !== false) throw new Error("Já existe uma mesa com esse número.");
    const { error } = existing
      ? await db.from("restaurant_tables").update({ active: true, capacity: body.capacity, updated_at: new Date().toISOString() }).eq("number", body.number)
      : await db.from("restaurant_tables").insert({ number: body.number, capacity: body.capacity, status: "free" });
    if (error) throw error;
    await db.from("audit_logs").insert({ actor_id: auth.userId === "demo" ? null : auth.userId, actor_label: auth.displayName, action: existing ? "TABLE_REACTIVATED" : "TABLE_CREATED", entity_type: "table", entity_id: String(body.number), after_data: body });
    return NextResponse.json({ saved: true }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: friendly(error) }, { status: 400 });
  }
}

const patchSchema = z.object({
  number: z.number().int().min(1).max(MAX_TABLE_NUMBER),
  capacity: z.number().int().min(1, "Informe ao menos 1 lugar.").max(50, "Máximo de 50 lugares por mesa.").optional(),
  active: z.boolean().optional(),
});

/** Altera os lugares ou ativa/desativa uma mesa. Só desativa mesa livre e sem comanda aberta. */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireOperationalRole(["manager"], "settings.manage");
    const body = patchSchema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { data: before, error: beforeError } = await db.from("restaurant_tables").select("*").eq("number", body.number).single();
    if (beforeError || !before) throw new Error("Mesa não encontrada.");
    if (body.active === false) {
      if (before.status !== "free") throw new Error("Libere a mesa antes de desativá-la.");
      const { count } = await db.from("tabs").select("id", { count: "exact", head: true }).eq("table_number", body.number).in("status", ["open", "partial"]);
      if (count) throw new Error("A mesa tem comanda aberta. Feche ou transfira a comanda antes de desativar.");
    }
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.capacity !== undefined) patch.capacity = body.capacity;
    if (body.active !== undefined) patch.active = body.active;
    const { error } = await db.from("restaurant_tables").update(patch).eq("number", body.number);
    if (error) throw error;
    await db.from("audit_logs").insert({ actor_id: auth.userId === "demo" ? null : auth.userId, actor_label: auth.displayName, action: "TABLE_SETTINGS_UPDATED", entity_type: "table", entity_id: String(body.number), before_data: before, after_data: patch });
    return NextResponse.json({ saved: true });
  } catch (error) {
    return NextResponse.json({ error: friendly(error) }, { status: 400 });
  }
}
