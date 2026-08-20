import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { healthLabels, mapHealthCheck } from "@/lib/admin-control";
import type { SystemHealthCheck } from "@/types";

const actionSchema = z.object({ action: z.enum(["run_all", "run_one"]), key: z.string().max(80).optional() });

type CheckResult = Omit<SystemHealthCheck, "label">;

async function runDatabaseCheck(db: NonNullable<ReturnType<typeof createAdminClient>>): Promise<CheckResult> {
  const started = Date.now();
  const { error } = await db.from("business_settings").select("id").limit(1);
  return {
    key: "database",
    status: error ? "error" : "operational",
    detail: error ? error.message : `Consulta concluída em ${Date.now() - started} ms.`,
    checkedAt: new Date().toISOString(),
    metadata: { latencyMs: Date.now() - started },
  };
}

async function runMigrationsCheck(db: NonNullable<ReturnType<typeof createAdminClient>>): Promise<CheckResult> {
  const { data, error } = await db.from("system_migrations").select("version,name,applied_at").order("version", { ascending: false }).limit(1);
  if (error) return { key: "migrations", status: "error", detail: "Tabela de migrations não encontrada. Execute a migration 014.", checkedAt: new Date().toISOString(), metadata: { error: error.message } };
  const latest = data?.[0] as { version?: number; name?: string; applied_at?: string } | undefined;
  const version = Number(latest?.version || 0);
  return {
    key: "migrations",
    status: version >= 18 ? "operational" : "warning",
    detail: version >= 18 ? `Banco atualizado até a migration ${version}.` : `Banco está na migration ${version}; esta versão exige a migration 18.`,
    checkedAt: new Date().toISOString(),
    metadata: { version, latest },
  };
}

async function runQueueCheck(db: NonNullable<ReturnType<typeof createAdminClient>>): Promise<CheckResult> {
  const [sync, notification, integration] = await Promise.all([
    db.from("sync_queue").select("id", { count: "exact", head: true }).in("status", ["queued", "failed"]),
    db.from("notification_jobs").select("id", { count: "exact", head: true }).in("status", ["queued", "failed"]),
    db.from("integration_events").select("id", { count: "exact", head: true }).in("status", ["failed", "dead_letter"]),
  ]);
  const error = sync.error || notification.error || integration.error;
  const total = (sync.count || 0) + (notification.count || 0) + (integration.count || 0);
  return {
    key: "queues",
    status: error ? "error" : total > 20 ? "warning" : "operational",
    detail: error ? error.message : `${total} item(ns) aguardando atenção nas filas.`,
    checkedAt: new Date().toISOString(),
    metadata: { sync: sync.count || 0, notifications: notification.count || 0, integrations: integration.count || 0 },
  };
}

async function runPrintCheck(db: NonNullable<ReturnType<typeof createAdminClient>>): Promise<CheckResult> {
  const [profiles, failed] = await Promise.all([
    db.from("print_profiles").select("key,active,auto_print"),
    db.from("print_jobs").select("id", { count: "exact", head: true }).eq("status", "failed"),
  ]);
  const error = profiles.error || failed.error;
  const activeProfiles = (profiles.data || []).filter((profile: { active?: boolean }) => profile.active).length;
  const failures = failed.count || 0;
  return {
    key: "print_bridge",
    status: error ? "error" : failures > 0 || activeProfiles === 0 ? "warning" : "operational",
    detail: error ? error.message : `${activeProfiles} perfil(is) ativo(s) e ${failures} falha(s) na fila. O agente local precisa confirmar o equipamento físico.`,
    checkedAt: new Date().toISOString(),
    metadata: { activeProfiles, failures },
  };
}

async function runIntegrationsCheck(db: NonNullable<ReturnType<typeof createAdminClient>>): Promise<CheckResult> {
  const { data, error } = await db.from("integration_connections").select("provider,active,last_health_at,last_health_status");
  if (error) return { key: "integrations", status: "error", detail: error.message, checkedAt: new Date().toISOString() };
  const rows = (data || []) as Array<{ provider: string; active: boolean; last_health_at?: string | null; last_health_status?: string | null }>;
  const active = rows.filter((row) => row.active);
  const failed = active.filter((row) => row.last_health_status && !["ok", "operational", "healthy"].includes(row.last_health_status.toLowerCase()));
  return {
    key: "integrations",
    status: failed.length ? "warning" : "operational",
    detail: active.length ? `${active.length} integração(ões) ativa(s); ${failed.length} com alerta.` : "Integrações externas ainda não foram ativadas. A operação manual continua disponível.",
    checkedAt: new Date().toISOString(),
    metadata: { providers: rows },
  };
}

async function runAuthenticationCheck(db: NonNullable<ReturnType<typeof createAdminClient>>): Promise<CheckResult> {
  const { count, error } = await db.from("profiles").select("id", { count: "exact", head: true }).eq("active", true);
  return {
    key: "authentication",
    status: error ? "error" : (count || 0) > 0 ? "operational" : "warning",
    detail: error ? error.message : `${count || 0} perfil(is) ativo(s) configurado(s).`,
    checkedAt: new Date().toISOString(),
    metadata: { activeProfiles: count || 0 },
  };
}

async function runRealtimeCheck(db: NonNullable<ReturnType<typeof createAdminClient>>): Promise<CheckResult> {
  const { count, error } = await db.from("orders").select("id", { count: "exact", head: true }).is("deleted_at", null);
  return {
    key: "realtime",
    status: error ? "error" : "operational",
    detail: error ? error.message : `Canal de dados disponível; ${count || 0} pedido(s) na base. A assinatura do navegador é validada durante o uso.`,
    checkedAt: new Date().toISOString(),
    metadata: { orders: count || 0 },
  };
}

async function runStorageCheck(db: NonNullable<ReturnType<typeof createAdminClient>>): Promise<CheckResult> {
  const { count, error } = await db.from("products").select("id", { count: "exact", head: true }).not("image_url", "is", null);
  return {
    key: "storage",
    status: error ? "error" : "operational",
    detail: error ? error.message : `${count || 0} produto(s) possuem imagem oficial vinculada.`,
    checkedAt: new Date().toISOString(),
    metadata: { productsWithImages: count || 0 },
  };
}

async function executeCheck(key: string, db: NonNullable<ReturnType<typeof createAdminClient>>): Promise<CheckResult> {
  const runners: Record<string, () => Promise<CheckResult>> = {
    database: () => runDatabaseCheck(db),
    authentication: () => runAuthenticationCheck(db),
    realtime: () => runRealtimeCheck(db),
    print_bridge: () => runPrintCheck(db),
    queues: () => runQueueCheck(db),
    migrations: () => runMigrationsCheck(db),
    storage: () => runStorageCheck(db),
    integrations: () => runIntegrationsCheck(db),
  };
  const runner = runners[key];
  if (!runner) throw new Error("Diagnóstico desconhecido.");
  return runner();
}

export async function GET() {
  try {
    await requireOperationalRole(["manager", "viewer"], "audit.view");
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const [checksResult, migrationsResult, recentErrorsResult] = await Promise.all([
      db.from("system_health_checks").select("*").order("key"),
      db.from("system_migrations").select("*").order("version", { ascending: false }).limit(20),
      db.from("audit_logs").select("id,action,entity_type,entity_id,reason,created_at").or("action.ilike.%FAILED%,action.ilike.%ERROR%").order("created_at", { ascending: false }).limit(25),
    ]);
    if (checksResult.error) throw checksResult.error;
    return NextResponse.json({
      checks: (checksResult.data || []).map((row: Record<string, unknown>) => mapHealthCheck(row)),
      migrations: migrationsResult.data || [],
      recentErrors: recentErrorsResult.data || [],
      requiredMigration: 18,
      appVersion: "8.0.0",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao consultar diagnóstico." }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOperationalRole(["manager"], "audit.view");
    const body = actionSchema.parse(await request.json());
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const keys = body.action === "run_one" ? [body.key || "database"] : Object.keys(healthLabels);
    const results: SystemHealthCheck[] = [];
    for (const key of keys) {
      const result = await executeCheck(key, db);
      const payload = { key: result.key, status: result.status, detail: result.detail, metadata: result.metadata || {}, checked_at: result.checkedAt, checked_by: auth.userId === "demo" ? null : auth.userId };
      const { error } = await db.from("system_health_checks").upsert(payload, { onConflict: "key" });
      if (error) throw error;
      results.push({ ...result, label: healthLabels[result.key] || result.key });
    }
    await db.from("audit_logs").insert({ actor_id: auth.userId === "demo" ? null : auth.userId, actor_label: auth.displayName, action: "SYSTEM_DIAGNOSTICS_EXECUTED", entity_type: "system", entity_id: body.action === "run_one" ? body.key || "database" : "all", after_data: { results } });
    return NextResponse.json({ checks: results });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao executar diagnóstico." }, { status: 400 });
  }
}
