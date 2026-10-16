import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const dayHours = z.tuple([time,time]).refine(v=>v[0]!==v[1],"Horário de abertura e fechamento devem ser diferentes.").nullable();
const schema = z.object({
  name: z.string().trim().min(2).max(180).optional(),
  phone: z.string().trim().min(8).max(30).optional(),
  contactPhones: z.array(z.string().trim().min(8).max(30)).max(5).optional(),
  instagram: z.string().trim().max(120).regex(/^@?[A-Za-z0-9_.]*$/,"Informe apenas o @ do Instagram.").optional(),
  minimumOrder: z.number().int().nonnegative().optional(),
  openingHours: z.object({sunday:dayHours,monday:dayHours,tuesday:dayHours,wednesday:dayHours,thursday:dayHours,friday:dayHours,saturday:dayHours}).optional(),
  config: z.object({
    pixKey: z.string().max(200).nullable().optional(),
    pixKeyType: z.string().max(50).nullable().optional(),
    pixConfirmation: z.enum(["manual", "automatic"]).optional(),
    serviceFeePercent: z.number().min(0).max(100).optional(),
    waiterCommissionPercent: z.number().min(0).max(100).optional(),
    schedulingEnabled: z.boolean().optional(),
    maximumDeliveryKm: z.number().nonnegative().nullable().optional(),
    fiscalMode: z.enum(["non_fiscal", "nfce", "external"]).optional(),
    preparationCapacityPerSlot: z.number().int().positive().nullable().optional()
  }).partial().optional()
});

export async function GET() {
  try {
    await requireOperationalRole(["manager", "counter", "finance"], "settings.manage");
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const [settingsResult, zonesResult] = await Promise.all([
      db.from("business_settings").select("*").order("created_at").limit(1).single(),
      db.from("delivery_zones").select("*").is("deleted_at", null).order("name")
    ]);
    if (settingsResult.error) throw settingsResult.error;
    if (zonesResult.error) throw zonesResult.error;
    return NextResponse.json({ settings: settingsResult.data, deliveryZones: zonesResult.data || [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao consultar configurações." }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireOperationalRole(["manager"], "settings.manage");
    const body = schema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { data: current, error: currentError } = await db.from("business_settings").select("*").order("created_at").limit(1).single();
    if (currentError) throw currentError;
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.minimumOrder !== undefined) payload.minimum_order_cents = body.minimumOrder;
    if (body.openingHours !== undefined) payload.opening_hours = body.openingHours;
    if (body.name !== undefined) payload.name=body.name;
    if (body.phone !== undefined) payload.phone=body.phone;
    if (body.instagram !== undefined) payload.instagram=body.instagram;
    if (body.config !== undefined || body.contactPhones !== undefined) payload.config = { ...(current.config || {}), ...body.config, ...(body.contactPhones !== undefined?{contactPhones:body.contactPhones}:{}) };
    const { error } = await db.from("business_settings").update(payload).eq("id", current.id);
    if (error) throw error;
    await db.from("audit_logs").insert({ actor_id: auth.userId === "demo" ? null : auth.userId, actor_label: auth.displayName, action: "BUSINESS_SETTINGS_UPDATED", entity_type: "business_settings", entity_id: current.id, before_data: current, after_data: payload });
    return NextResponse.json({ saved: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Configuração inválida." }, { status: 400 });
  }
}

