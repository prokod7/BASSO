import { NextRequest, NextResponse } from "next/server";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { IfoodAdapter } from "@/lib/integrations/ifood";
import { Food99Adapter } from "@/lib/integrations/food99";
import { RedeAdapter } from "@/lib/integrations/rede";

type ProviderKey = "ifood" | "99food" | "rede" | "onesignal" | "printer" | "supabase";
type ProviderHealth = { configured: boolean; ok?: boolean; detail?: string; checkedAt?: string };

function configuredProviders(): Record<ProviderKey, ProviderHealth> {
  return {
    supabase: {
      configured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
      detail: "URL e chave de serviço"
    },
    ifood: {
      configured: Boolean(process.env.IFOOD_CLIENT_ID && process.env.IFOOD_CLIENT_SECRET && process.env.IFOOD_WEBHOOK_SECRET),
      detail: "OAuth e segredo do webhook"
    },
    "99food": {
      configured: Boolean(process.env.FOOD99_CLIENT_ID && process.env.FOOD99_CLIENT_SECRET && process.env.FOOD99_BASE_URL && process.env.FOOD99_WEBHOOK_SECRET),
      detail: "Credenciais, endpoint e segredo do webhook"
    },
    rede: {
      configured: Boolean(process.env.REDE_BASE_URL && process.env.REDE_PV && process.env.REDE_TOKEN),
      detail: "Endpoint, PV e token homologados"
    },
    onesignal: {
      configured: Boolean((process.env.ONESIGNAL_APP_ID || process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID) && process.env.ONESIGNAL_REST_API_KEY),
      detail: "App ID e REST API key"
    },
    printer: {
      configured: Boolean(process.env.PRINT_BRIDGE_KEY),
      detail: "Chave do bridge local"
    }
  };
}

async function liveHealth(key: ProviderKey): Promise<{ ok: boolean; detail: string }> {
  if (key === "ifood") return new IfoodAdapter().health();
  if (key === "99food") return new Food99Adapter().health();
  if (key === "rede") return new RedeAdapter().health();
  if (key === "supabase") {
    const db = createAdminClient();
    if (!db) return { ok: false, detail: "Supabase não configurado." };
    const { error } = await db.from("business_settings").select("id", { head: true, count: "exact" }).limit(1);
    return error ? { ok: false, detail: error.message } : { ok: true, detail: "Banco acessível" };
  }
  if (key === "onesignal") return { ok: true, detail: "Credenciais presentes; envio real é validado no primeiro teste." };
  return { ok: true, detail: "Bridge configurado; disponibilidade é confirmada pelo heartbeat local." };
}

export async function GET(request: NextRequest) {
  try {
    await requireOperationalRole(["manager"], "settings.manage");
    const providers = configuredProviders();
    const shouldCheckLive = request.nextUrl.searchParams.get("live") === "true";
    const selected = request.nextUrl.searchParams.get("provider") as ProviderKey | null;
    const keys = (selected ? [selected] : Object.keys(providers)) as ProviderKey[];

    if (shouldCheckLive) {
      for (const key of keys) {
        if (!(key in providers)) continue;
        const checkedAt = new Date().toISOString();
        if (!providers[key].configured) {
          providers[key] = { ...providers[key], ok: false, detail: "Credenciais ou parâmetros incompletos.", checkedAt };
          continue;
        }
        const result = await liveHealth(key);
        providers[key] = { ...providers[key], ...result, checkedAt };
      }
    }

    const db = createAdminClient();
    if (db && shouldCheckLive) {
      const persisted = (["ifood", "99food", "rede", "onesignal", "printer"] as const)
        .filter(key => providers[key].checkedAt)
        .map(key => ({
          provider: key,
          active: providers[key].configured,
          last_health_at: providers[key].checkedAt,
          last_health_status: providers[key].ok ? "ok" : "error",
          updated_at: new Date().toISOString()
        }));
      if (persisted.length) await db.from("integration_connections").upsert(persisted, { onConflict: "provider" });
    }

    return NextResponse.json({ generatedAt: new Date().toISOString(), live: shouldCheckLive, providers }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não autorizado." }, { status: 401 });
  }
}
