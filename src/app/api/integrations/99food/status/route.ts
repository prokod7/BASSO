import { NextResponse } from "next/server";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { food99CredentialStatus } from "@/lib/integrations/food99/config";
import { FOOD99_OFFICIAL_DOCS_REQUIRED } from "@/lib/integrations/food99/official-contract";

export async function GET() {
  try {
    await requireOperationalRole(["manager"], "settings.manage");
    const { config, configured, missing, fields } = food99CredentialStatus();
    const db = createAdminClient();
    let recentEvents: Array<Record<string, unknown>> = [];
    let connection: Record<string, unknown> | null = null;
    if (db) {
      const [{ data: events }, { data: stored }] = await Promise.all([
        db.from("integration_events")
          .select("id,event_id,event_type,direction,status,attempts,last_error,external_order_id,correlation_id,created_at,processed_at")
          .eq("provider", "99food")
          .order("created_at", { ascending: false })
          .limit(20),
        db.from("integration_connections").select("provider,active,environment,last_health_at,last_health_status,updated_at").eq("provider", "99food").maybeSingle(),
      ]);
      recentEvents = events || [];
      connection = stored || null;
    }

    return NextResponse.json({
      provider: "99food",
      appName: "PedidoPro 99Food Teste",
      environment: config.environment,
      appShopId: config.appShopId,
      webhookUrl: "https://basso-seven.vercel.app/api/integrations/99food/webhook",
      credentials: fields,
      missingEnv: missing,
      configured,
      officialContractReady: false,
      operational: false,
      state: configured ? "awaiting_official_contract" : "awaiting_credentials",
      blocker: configured ? "A integração não fará chamadas nem aceitará webhooks até o contrato oficial da Plataforma Aberta 99Food ser aplicado sem suposições." : undefined,
      officialDocumentationNeeded: [...FOOD99_OFFICIAL_DOCS_REQUIRED],
      connection,
      recentEvents,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não autorizado." }, { status: 401 });
  }
}
