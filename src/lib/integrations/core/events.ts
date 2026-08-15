import { createAdminClient } from "@/lib/supabase/admin";
import { integrationCorrelationId } from "@/lib/integrations/core/correlation";
import { redactIntegrationValue } from "@/lib/integrations/core/safe-log";

export interface EnqueueIntegrationEventInput {
  provider: string;
  eventId: string;
  eventType: string;
  direction?: "incoming" | "outgoing";
  externalOrderId?: string | null;
  payload: Record<string, unknown>;
  correlationId?: string;
}

export async function enqueueIntegrationEvent(input: EnqueueIntegrationEventInput) {
  const db = createAdminClient();
  if (!db) throw new Error("Supabase não configurado.");
  const correlationId = input.correlationId || integrationCorrelationId(input.provider);
  const row = {
    provider: input.provider,
    event_id: input.eventId,
    event_type: input.eventType,
    direction: input.direction || "incoming",
    external_order_id: input.externalOrderId || null,
    correlation_id: correlationId,
    payload: redactIntegrationValue(input.payload),
    status: "pending",
    attempts: 0,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await db.from("integration_events")
    .upsert(row, { onConflict: "provider,event_id", ignoreDuplicates: true })
    .select("id,provider,event_id,event_type,status,correlation_id")
    .maybeSingle();
  if (error) throw error;
  return { row: data, correlationId };
}
