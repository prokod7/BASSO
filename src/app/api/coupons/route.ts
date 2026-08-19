import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

const channelSchema = z.enum(["own_delivery","pickup","counter","dine_in","ifood","99food","table_qr"]);
const schema = z.object({
  code: z.string().trim().min(2).max(30).regex(/^[A-Za-z0-9_-]+$/, "Use apenas letras, números, hífen ou underline."),
  type: z.enum(["percentage","fixed"]),
  value: z.number().int().positive(),
  totalLimit: z.number().int().positive().nullable(),
  minimum: z.number().int().nonnegative().nullable(),
  channels: z.array(channelSchema).min(1),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  active: z.boolean(),
}).superRefine((value, context) => {
  if (value.type === "percentage" && value.value > 100) context.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "Percentual máximo é 100%." });
  if (value.startsAt && value.endsAt && Date.parse(value.endsAt) <= Date.parse(value.startsAt)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["endsAt"], message: "O término deve ser posterior ao início." });
});

export async function GET() {
  try {
    await requireOperationalRole(["manager","counter","finance","viewer"], "menu.manage");
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { data, error } = await db.from("coupons").select("*").order("created_at", { ascending: false }).limit(300);
    if (error) throw error;
    const coupons = (data || []).map((row: any) => ({ id: row.id, code: row.code, type: row.discount_type, value: row.value, totalLimit: row.total_limit, uses: row.uses, minimum: row.minimum_cents, channels: row.channels, active: row.active, startsAt: row.starts_at || undefined, endsAt: row.ends_at || undefined }));
    return NextResponse.json({ coupons }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao consultar cupons." }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOperationalRole(["manager","counter"], "menu.manage");
    const coupon = schema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const payload = { code: coupon.code.toUpperCase(), discount_type: coupon.type, value: coupon.value, total_limit: coupon.totalLimit, minimum_cents: coupon.minimum, channels: coupon.channels, starts_at: coupon.startsAt || null, ends_at: coupon.endsAt || null, active: coupon.active };
    const { data, error } = await db.from("coupons").insert(payload).select("id").single();
    if (error) throw error;
    await db.from("audit_logs").insert({ actor_id: auth.userId === "demo" ? null : auth.userId, actor_label: auth.displayName, action: "COUPON_CREATED", entity_type: "coupon", entity_id: data.id, after_data: payload });
    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Cupom inválido." }, { status: 400 });
  }
}
