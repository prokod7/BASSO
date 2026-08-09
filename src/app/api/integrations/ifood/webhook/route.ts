import { createHash } from "crypto";
import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import {
  ifoodEventCode,
  isIfoodKeepalive,
  verifyIfoodWebhookSignature,
  type IfoodWebhookEvent,
} from "@/lib/integrations/ifood";
import { createAdminClient } from "@/lib/supabase/admin";
import { drainIntegrationQueue } from "@/lib/workers/marketplace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function eventId(payload: IfoodWebhookEvent, rawBody: string): string {
  if (typeof payload.id === "string" && payload.id.trim()) return payload.id.trim();
  return `body-${createHash("sha256").update(rawBody).digest("hex")}`;
}

function merchantAllowed(payload: IfoodWebhookEvent): boolean {
  const configured = process.env.IFOOD_MERCHANT_ID?.trim();
  if (!configured || isIfoodKeepalive(payload)) return true;
  return !payload.merchantId || payload.merchantId === configured;
}

export async function POST(request: NextRequest) {
  const clientSecret = process.env.IFOOD_CLIENT_SECRET || "";
  if (!clientSecret) {
    return NextResponse.json({ error: "IFOOD_CLIENT_SECRET não configurado." }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-ifood-signature");
  if (!verifyIfoodWebhookSignature(rawBody, signature, clientSecret)) {
    return NextResponse.json({ error: "Assinatura do iFood inválida." }, { status: 401 });
  }

  let payload: IfoodWebhookEvent;
  try {
    payload = JSON.parse(rawBody || "{}") as IfoodWebhookEvent;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json({ error: "Evento inválido." }, { status: 400 });
  }

  // O heartbeat só precisa de uma resposta 2xx rápida. O corpo da resposta é ignorado pelo iFood.
  if (isIfoodKeepalive(payload)) {
    return NextResponse.json({ received: true }, { status: 202 });
  }

  // Este deploy pertence a uma única loja. Eventos de outro merchant são reconhecidos e descartados.
  if (!merchantAllowed(payload)) {
    return NextResponse.json({ received: true, ignored: true }, { status: 202 });
  }

  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });

  const id = eventId(payload, rawBody);
  const { data, error } = await db.from("integration_events").upsert({
    provider: "ifood",
    event_id: id,
    event_type: ifoodEventCode(payload),
    direction: "incoming",
    payload,
    status: "pending",
    attempts: 0,
  }, { onConflict: "provider,event_id", ignoreDuplicates: true }).select("id").maybeSingle();

  if (error) return NextResponse.json({ error: "Não foi possível registrar o evento." }, { status: 500 });

  if (data?.id) {
    after(async () => {
      try {
        await drainIntegrationQueue(10);
      } catch {
        // O cron protegido mantém a retentativa durável caso o processamento imediato falhe.
      }
    });
  }

  return NextResponse.json({ received: true, eventId: id }, { status: 202 });
}
