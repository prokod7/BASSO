import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
const schema = z.object({ orderId: z.string().min(4), token: z.string().min(16), rating: z.number().int().min(1).max(5), comment: z.string().max(1000).optional() });
export async function POST(request: NextRequest) {
  try {
    const input = schema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { data, error } = await db.rpc("create_public_order_review", { p_order_id: input.orderId, p_token: input.token, p_rating: input.rating, p_comment: input.comment || null });
    if (error) throw error;
    return NextResponse.json({ id: data, saved: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Avaliação inválida." }, { status: 400 }); }
}
