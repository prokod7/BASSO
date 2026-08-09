import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ ttlSeconds: z.number().int().min(30).max(600).default(180) });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireOperationalRole(["manager", "counter", "waiter", "kitchen", "bar", "finance"], "orders.edit");
    const { id } = await params;
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    const ttlSeconds = parsed.success ? parsed.data.ttlSeconds : 180;
    if (auth.userId === "demo") return NextResponse.json({ acquired: true, holderId: "demo", holderLabel: auth.displayName, expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString() });
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { data, error } = await db.rpc("acquire_order_edit_lock", { p_order_id: id, p_holder_id: auth.userId, p_holder_label: auth.displayName, p_ttl_seconds: ttlSeconds });
    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao reservar edição do pedido." }, { status: 400 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireOperationalRole(["manager", "counter", "waiter", "kitchen", "bar", "finance"]);
    const { id } = await params;
    if (auth.userId === "demo") return NextResponse.json({ released: true });
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const { data, error } = await db.rpc("release_order_edit_lock", { p_order_id: id, p_holder_id: auth.userId, p_force: auth.role === "manager" });
    if (error) throw error;
    return NextResponse.json({ released: Boolean(data) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao liberar edição." }, { status: 400 });
  }
}
