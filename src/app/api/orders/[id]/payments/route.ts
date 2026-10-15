import { apiErrorMessage } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  method: z.enum([
    "pix", "cash", "debit", "credit", "meal_voucher", "food_voucher",
    "vr_refeicao", "vr_alimentacao", "sodexo", "pluxe", "alelo_refeicao", "ticket_restaurante", "voucher",
  ]),
  amount: z.number().int().positive(),
  idempotencyKey: z.string().min(8).max(160),
  note: z.string().max(500).optional(),
  changeFor: z.number().int().nonnegative().optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireOperationalRole(["manager", "counter", "finance"], "payments.manage");
    const { id } = await params;
    const body = schema.parse(await request.json());
    if (body.method !== "cash" && body.changeFor != null) throw new Error("Troco só pode ser informado em pagamentos em dinheiro.");
    if (body.method === "cash" && body.changeFor != null && body.changeFor < body.amount) throw new Error("O valor para troco não pode ser menor que o recebimento em dinheiro.");
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { data, error } = await db.rpc("record_order_payment_transaction", {
      p_order_id: id,
      p_method: body.method,
      p_amount: body.amount,
      p_idempotency_key: body.idempotencyKey,
      p_actor_id: auth.userId === "demo" ? null : auth.userId,
      p_metadata: { note: body.note || null, changeFor: body.changeFor ?? null, source: "admin_control_center" },
    });
    if (error) throw error;
    return NextResponse.json(data, { status: data?.duplicate ? 200 : 201 });
  } catch (error) {
    return NextResponse.json({ error: apiErrorMessage(error, "Falha ao registrar pagamento.") }, { status: 400 });
  }
}
