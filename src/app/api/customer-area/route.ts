import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

async function loadArea(tokens: unknown) {
  if (!Array.isArray(tokens) || tokens.length < 1 || tokens.length > 100 || tokens.some(t => typeof t !== "string" || t.length < 16 || t.length > 200)) {
    return NextResponse.json({ error: "Links privados dos pedidos obrigatórios." }, { status: 401 });
  }
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
  const hashes = [...new Set((tokens as string[]).map(t => createHash("sha256").update(t).digest("hex")))];
  const { data: access, error } = await db.from("order_access_tokens").select("order_id")
    .in("token_hash", hashes).is("revoked_at", null).gt("expires_at", new Date().toISOString());
  if (error) throw error;
  if (!access?.length) return NextResponse.json({ error: "Acesso expirado ou inválido." }, { status: 401 });
  const ids = [...new Set(access.map(row => row.order_id))];
  const { data: orders, error: orderError } = await db.from("orders")
    .select("id,number,status,total_cents,created_at,updated_at,channel")
    .in("id", ids).is("deleted_at", null).not("channel", "in", "(ifood,99food)")
    .order("created_at", { ascending: false }).limit(100);
  if (orderError) throw orderError;
  return NextResponse.json({ loyalty: null, orders: (orders || []).map(o => ({
    id: o.id, number: Number(o.number), status: o.status, total: Number(o.total_cents),
    createdAt: o.created_at, updatedAt: o.updated_at, channel: o.channel,
  })) }, { headers: { "Cache-Control": "private, no-store" } });
}
export async function GET(request: NextRequest) {
  try { return await loadArea([request.nextUrl.searchParams.get("token")]); }
  catch { return NextResponse.json({ error: "Falha ao abrir área do cliente." }, { status: 400 }); }
}
export async function POST(request: NextRequest) {
  try { const body = await request.json(); return await loadArea(body?.tokens); }
  catch { return NextResponse.json({ error: "Falha ao abrir área do cliente." }, { status: 400 }); }
}
