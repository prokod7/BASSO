import { NextRequest, NextResponse } from "next/server";
import { food99CredentialStatus } from "@/lib/integrations/food99/config";
import { parseFood99Webhook, validateFood99Webhook } from "@/lib/integrations/food99/webhook";
import { enqueueIntegrationEvent } from "@/lib/integrations/core/events";
import { IntegrationDocumentationRequiredError } from "@/lib/integrations/core/errors";
import { integrationCorrelationId } from "@/lib/integrations/core/correlation";

export async function GET() {
  const { config, configured, missing } = food99CredentialStatus();
  return NextResponse.json({
    provider: "99food",
    route: "/api/integrations/99food/webhook",
    environment: config.environment,
    credentialsConfigured: configured,
    missingEnv: missing,
    webhookContractReady: false,
    status: configured ? "awaiting_official_contract" : "awaiting_credentials",
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const correlationId = integrationCorrelationId("99food");
  try {
    const { configured, missing } = food99CredentialStatus();
    if (!configured) {
      return NextResponse.json({
        received: false,
        code: "FOOD99_CREDENTIALS_MISSING",
        missingEnv: missing,
        correlationId,
      }, { status: 503 });
    }

    const rawBody = await request.text();
    await validateFood99Webhook(rawBody, request.headers);
    const event = parseFood99Webhook(rawBody, request.headers);
    await enqueueIntegrationEvent({
      provider: "99food",
      eventId: event.eventId,
      eventType: event.eventType,
      externalOrderId: event.externalOrderId,
      payload: event.payload,
      correlationId,
    });
    return NextResponse.json({ received: true, correlationId }, { status: 202 });
  } catch (error) {
    if (error instanceof IntegrationDocumentationRequiredError) {
      return NextResponse.json({
        received: false,
        code: error.code,
        error: error.message,
        correlationId,
      }, { status: 503 });
    }
    return NextResponse.json({
      received: false,
      code: "FOOD99_WEBHOOK_REJECTED",
      error: error instanceof Error ? error.message : "Falha ao validar webhook 99Food.",
      correlationId,
    }, { status: 401 });
  }
}
