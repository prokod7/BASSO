import { apiErrorMessage } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("open"), initial: z.number().int().nonnegative() }),
  z.object({ action: z.literal("close"), declared: z.number().int().nonnegative(), notes: z.string().max(500).optional() }),
  z.object({ action: z.literal("movement"), kind: z.enum(["supply", "withdrawal", "adjustment"]), amount: z.number().int().positive(), reason: z.string().min(2).max(300) })
]);

export async function GET() {
  try {
    await requireOperationalRole(["manager", "counter", "finance"], "cash.manage");
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { data: session, error } = await db.from("cash_sessions").select("*").eq("status", "open").order("opened_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    if (!session) return NextResponse.json({ open: false, session: null, movements: [], expectedCents: 0 }, { headers: { "Cache-Control": "no-store" } });
    const { data: movements, error: movementError } = await db.from("cash_movements").select("id,kind,amount_cents,reason,created_at,created_by").eq("session_id", session.id).order("created_at", { ascending: false });
    if (movementError) throw movementError;
    const expectedCents = session.initial_cents + (movements || []).reduce((sum: number, movement: any) => sum + movement.amount_cents, 0);
    return NextResponse.json({ open: true, session, movements: movements || [], expectedCents }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: apiErrorMessage(error, "Falha ao consultar caixa.") }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOperationalRole(["manager", "counter", "finance"], "cash.manage");
    const body = actionSchema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const actorId = auth.userId === "demo" ? null : auth.userId;

    if (body.action === "open") {
      const { data, error } = await db.rpc("open_cash_session", { p_initial_cents: body.initial, p_actor_id: actorId });
      if (error) throw error;
      return NextResponse.json({ id: data, open: true });
    }
    if (body.action === "close") {
      const { data, error } = await db.rpc("close_cash_session", { p_declared_cents: body.declared, p_notes: body.notes || null, p_actor_id: actorId });
      if (error) throw error;
      return NextResponse.json({ id: data, open: false });
    }
    const { data, error } = await db.rpc("record_cash_movement", { p_kind: body.kind, p_amount_cents: body.amount, p_reason: body.reason, p_actor_id: actorId });
    if (error) throw error;
    return NextResponse.json({ id: data, recorded: true }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: apiErrorMessage(error, "Falha no caixa.") }, { status: 400 });
  }
}

