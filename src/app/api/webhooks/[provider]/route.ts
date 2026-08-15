import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

/**
 * Legacy generic webhook route kept only for the already-working iFood integration.
 * 99Food has its own exact route and Rede/Laranjinha remains blocked until the official
 * SmartPOS contract is supplied. This avoids guessing provider-specific headers.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (provider === "99food") {
    return NextResponse.json({ error: "Use /api/integrations/99food/webhook para a 99Food." }, { status: 410 });
  }
  if (provider === "rede") {
    return NextResponse.json({ error: "Rede/Laranjinha aguarda SDK/App2App oficial e não usa este webhook genérico." }, { status: 410 });
  }
  if (provider !== "ifood") return NextResponse.json({ error: "Provedor inválido." }, { status: 404 });

  const raw = await request.text();
  const secret = process.env.IFOOD_WEBHOOK_SECRET;
  if (!secret && process.env.NODE_ENV === "production") return NextResponse.json({ error: "Segredo do webhook não configurado." }, { status: 503 });
  const signature = request.headers.get("x-ifood-signature") || request.headers.get("x-signature");
  if (secret) {
    const expected = createHmac("sha256", secret).update(raw).digest("hex");
    if (!signature || !safeEqual(expected, signature)) return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 });
  }
  const eventId = request.headers.get("x-event-id") || request.headers.get("idempotency-key");
  if (!eventId) return NextResponse.json({ error: "Identificador de evento obrigatório." }, { status: 400 });
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(raw || "{}"); }
  catch { return NextResponse.json({ error: "JSON inválido." }, { status: 400 }); }
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
  const eventType = typeof payload.type === "string" ? payload.type : typeof payload.eventType === "string" ? payload.eventType : "unknown";
  const { error } = await db.from("integration_events").upsert({
    provider,
    event_id: eventId,
    event_type: eventType,
    payload,
    status: "pending",
    attempts: 0,
  }, { onConflict: "provider,event_id", ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ received: true, eventId }, { status: 202 });
}
