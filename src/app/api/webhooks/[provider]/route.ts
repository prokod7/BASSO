import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

function providerSecret(provider: string): string | undefined {
  if (provider === "ifood") return process.env.IFOOD_WEBHOOK_SECRET;
  if (provider === "99food") return process.env.FOOD99_WEBHOOK_SECRET;
  if (provider === "rede") return process.env.REDE_WEBHOOK_SECRET;
  return undefined;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!["ifood", "99food", "rede"].includes(provider)) return NextResponse.json({ error: "Provedor inválido." }, { status: 404 });
  const raw = await request.text();
  const secret = providerSecret(provider);
  if (!secret && process.env.NODE_ENV === "production") return NextResponse.json({ error: "Segredo do webhook não configurado." }, { status: 503 });
  const signature = request.headers.get("x-ifood-signature") || request.headers.get("x-99-signature") || request.headers.get("x-rede-signature") || request.headers.get("x-signature");
  if (secret) {
    const expected = createHmac("sha256", secret).update(raw).digest("hex");
    if (!signature || !safeEqual(expected, signature)) return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 });
  }
  const eventId = request.headers.get("x-event-id") || request.headers.get("idempotency-key");
  if (!eventId) return NextResponse.json({ error: "Identificador de evento obrigatório." }, { status: 400 });
  let payload: Record<string, any>;
  try { payload = JSON.parse(raw || "{}"); }
  catch { return NextResponse.json({ error: "JSON inválido." }, { status: 400 }); }
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
  const { error } = await db.from("integration_events").upsert({
    provider,
    event_id: eventId,
    event_type: payload.type || payload.eventType || "unknown",
    payload,
    status: "pending",
    attempts: 0
  }, { onConflict: "provider,event_id", ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ received: true, eventId }, { status: 202 });
}
