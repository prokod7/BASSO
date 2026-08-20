"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleHelp, CloudCog, Database, Download, HeartPulse, Loader2, Play, Printer, RefreshCw, ServerCog, ShieldCheck, TriangleAlert, Wifi } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/internal/PageHeader";
import { healthLabels } from "@/lib/admin-control";
import { isDemoMode, shortDateTime } from "@/lib/utils";
import type { SystemHealthCheck, SystemHealthStatus } from "@/types";

type MigrationRow = { version: number; name: string; applied_at: string };
type AuditErrorRow = { source?: "audit"; id: string | number; action: string; entity_type: string; entity_id: string; reason?: string | null; created_at: string };
type ClientErrorRow = { source: "client"; error_id: string; route?: string | null; message: string; digest?: string | null; app_version?: string | null; user_role?: string | null; resolved_at?: string | null; created_at: string };
type ErrorRow = AuditErrorRow | ClientErrorRow;

const iconMap: Record<string, LucideIcon> = {
  database: Database, authentication: ShieldCheck, realtime: Wifi, print_bridge: Printer,
  queues: ServerCog, migrations: CloudCog, storage: Database, integrations: CloudCog,
};

const demoChecks: SystemHealthCheck[] = Object.keys(healthLabels).map((key, index) => ({
  key,
  label: healthLabels[key],
  status: index === 3 ? "warning" : "operational",
  detail: index === 3 ? "Perfis cadastrados; a confirmação física depende do agente local." : "Verificação concluída sem falhas.",
  checkedAt: new Date(Date.now() - index * 3 * 60_000).toISOString(),
  metadata: {},
}));

export default function DiagnosticsPage() {
  const [checks, setChecks] = useState<SystemHealthCheck[]>([]);
  const [migrations, setMigrations] = useState<MigrationRow[]>([]);
  const [recentErrors, setRecentErrors] = useState<ErrorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [appVersion, setAppVersion] = useState("9.0.0");
  const [requiredMigration, setRequiredMigration] = useState(19);

  async function load() {
    setLoading(true); setMessage("");
    try {
      if (isDemoMode()) {
        setChecks(demoChecks);
        setMigrations([{ version: 19, name: "Final homologation", applied_at: new Date().toISOString() }]);
        setRecentErrors([]);
        setRequiredMigration(19);
        setAppVersion("9.0.0");
        return;
      }
      const response = await fetch("/api/system/diagnostics", { cache: "no-store" });
      const body = await response.json() as { checks?: SystemHealthCheck[]; migrations?: MigrationRow[]; recentErrors?: ErrorRow[]; requiredMigration?: number; appVersion?: string; error?: string };
      if (!response.ok) throw new Error(body.error || "Falha ao consultar diagnóstico.");
      setChecks(body.checks || []);
      setMigrations(body.migrations || []);
      setRecentErrors(body.recentErrors || []);
      setRequiredMigration(body.requiredMigration || 19);
      setAppVersion(body.appVersion || "9.0.0");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao consultar diagnóstico.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  async function run(key?: string) {
    setWorking(key || "all"); setMessage("");
    try {
      if (isDemoMode()) {
        await new Promise((resolve) => setTimeout(resolve, 550));
        const now = new Date().toISOString();
        setChecks((current) => current.map((check) => !key || check.key === key ? { ...check, checkedAt: now } : check));
        setMessage(key ? `${healthLabels[key] || key} verificado em modo demonstração.` : "Diagnóstico completo executado em modo demonstração.");
        return;
      }
      const response = await fetch("/api/system/diagnostics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(key ? { action: "run_one", key } : { action: "run_all" }) });
      const body = await response.json() as { checks?: SystemHealthCheck[]; error?: string };
      if (!response.ok) throw new Error(body.error || "Falha ao executar diagnóstico.");
      setChecks((current) => {
        const map = new Map(current.map((check) => [check.key, check]));
        for (const check of body.checks || []) map.set(check.key, check);
        return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
      });
      setMessage(key ? `${healthLabels[key] || key} verificado com sucesso.` : "Diagnóstico completo executado e salvo.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao executar diagnóstico.");
    } finally { setWorking(null); }
  }

  const summary = useMemo(() => ({
    operational: checks.filter((check) => check.status === "operational").length,
    warning: checks.filter((check) => check.status === "warning").length,
    error: checks.filter((check) => check.status === "error").length,
    unknown: checks.filter((check) => check.status === "unknown").length,
  }), [checks]);
  const latestMigration = migrations[0]?.version || 0;

  function exportDiagnostic() {
    const payload = { generatedAt: new Date().toISOString(), appVersion, requiredMigration, latestMigration, checks, migrations, recentErrors };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `diagnostico-pedidopro-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return <>
    <PageHeader title="Sistema e diagnóstico" icon={HeartPulse} description="Verifique banco, autenticação, Realtime, filas, impressão, integrações, erros por ID e versão das migrations antes de uma falha afetar a operação." actions={<><button className="btn-secondary" onClick={exportDiagnostic}><Download size={17} />Exportar diagnóstico</button><button className="btn-primary" disabled={Boolean(working)} onClick={() => void run()}>{working === "all" ? <Loader2 className="animate-spin" size={17} /> : <Play size={17} />}Executar diagnóstico completo</button></>} />
    {message && <p className={`mb-5 rounded-2xl p-4 text-sm font-semibold ${/falha|erro|não encontrada/i.test(message) ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{message}</p>}
    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><HealthMetric label="Operacionais" value={summary.operational} status="operational" /><HealthMetric label="Com alerta" value={summary.warning} status="warning" /><HealthMetric label="Com erro" value={summary.error} status="error" /><HealthMetric label="Sem diagnóstico" value={summary.unknown} status="unknown" /></div>
    {loading && <div className="surface grid min-h-64 place-items-center"><Loader2 className="animate-spin text-basso-wine" size={36} /></div>}
    {!loading && <div className="grid gap-6 xl:grid-cols-[1.35fr_.75fr]">
      <div className="space-y-4">{checks.map((check) => <HealthCard key={check.key} check={check} working={working === check.key} onRun={() => void run(check.key)} />)}{!checks.length && <div className="surface grid min-h-56 place-items-center text-center"><div><CircleHelp className="mx-auto text-black/20" size={38} /><p className="mt-3 font-bold">Nenhum diagnóstico salvo</p><p className="text-sm text-black/45">Execute o diagnóstico completo para criar a linha de base.</p></div></div>}</div>
      <aside className="space-y-5">
        <section className={`surface p-5 ${latestMigration < requiredMigration ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50/40"}`}><h2 className="flex items-center gap-2 font-display text-xl font-bold"><CloudCog size={20} />Versão do banco</h2><div className="mt-4 flex items-end justify-between"><div><p className="text-xs font-bold uppercase tracking-[.12em] text-black/40">Migration instalada</p><p className="font-display text-4xl font-bold">{latestMigration || "—"}</p></div><div className="text-right"><p className="text-xs text-black/45">mínima exigida</p><p className="text-2xl font-black">{requiredMigration}</p></div></div><p className="mt-4 text-xs leading-relaxed text-black/55">Aplicação {appVersion}. {latestMigration >= requiredMigration ? "Banco compatível com os recursos atuais." : `Execute a migration ${String(requiredMigration).padStart(3, "0")} antes de continuar.`}</p></section>
        <section className="surface overflow-hidden"><div className="border-b border-black/5 p-5"><h2 className="font-display text-xl font-bold">Migrations recentes</h2></div><div className="divide-y divide-black/5">{migrations.slice(0, 8).map((migration) => <div key={migration.version} className="flex items-center gap-3 p-4"><span className="grid h-9 w-9 place-items-center rounded-xl bg-basso-cream text-sm font-black text-basso-wine">{String(migration.version).padStart(3, "0")}</span><div className="min-w-0"><p className="truncate text-sm font-bold">{migration.name}</p><p className="text-[10px] text-black/35">{shortDateTime(migration.applied_at)}</p></div></div>)}{!migrations.length && <p className="p-5 text-sm text-black/45">Nenhuma migration registrada.</p>}</div></section>
        <section className="surface overflow-hidden"><div className="border-b border-black/5 p-5"><h2 className="font-display text-xl font-bold">Erros recentes</h2></div><div className="divide-y divide-black/5">{recentErrors.map((entry) => <ErrorEntry key={entry.source === "client" ? entry.error_id : String(entry.id)} entry={entry} />)}{!recentErrors.length && <div className="grid min-h-36 place-items-center text-center"><div><CheckCircle2 className="mx-auto text-emerald-600" size={30} /><p className="mt-2 text-sm font-bold">Sem erros auditados</p></div></div>}</div></section>
      </aside>
    </div>}
  </>;
}

function ErrorEntry({ entry }: { entry: ErrorRow }) {
  if (entry.source === "client") return <div className="p-4"><div className="flex items-start gap-2"><TriangleAlert className="mt-0.5 shrink-0 text-red-600" size={17} /><div className="min-w-0"><p className="text-sm font-black text-red-700">{entry.error_id}</p><p className="truncate text-xs text-black/45">{entry.route || "rota não informada"} • {entry.app_version || "versão não informada"}</p><p className="mt-1 text-xs text-black/60">{entry.message}</p><p className="mt-1 text-[10px] text-black/35">{shortDateTime(entry.created_at)}{entry.resolved_at ? " • resolvido" : " • pendente"}</p></div></div></div>;
  return <div className="p-4"><div className="flex items-start gap-2"><TriangleAlert className="mt-0.5 shrink-0 text-red-600" size={17} /><div><p className="text-sm font-bold">{entry.action}</p><p className="text-xs text-black/45">{entry.entity_type} • {entry.entity_id}</p><p className="mt-1 text-xs text-black/55">{entry.reason || "Sem detalhe adicional"}</p><p className="mt-1 text-[10px] text-black/35">{shortDateTime(entry.created_at)}</p></div></div></div>;
}

function HealthMetric({ label, value, status }: { label: string; value: number; status: SystemHealthStatus }) {
  const styles = status === "operational" ? "bg-emerald-50 text-emerald-700" : status === "warning" ? "bg-amber-50 text-amber-800" : status === "error" ? "bg-red-50 text-red-700" : "bg-stone-100 text-stone-600";
  return <div className="surface flex items-center gap-3 p-4"><span className={`grid h-10 w-10 place-items-center rounded-xl ${styles}`}>{status === "operational" ? <CheckCircle2 size={19} /> : status === "warning" ? <AlertTriangle size={19} /> : status === "error" ? <TriangleAlert size={19} /> : <CircleHelp size={19} />}</span><div><strong className="block text-2xl">{value}</strong><span className="text-xs text-black/45">{label}</span></div></div>;
}
function HealthCard({ check, working, onRun }: { check: SystemHealthCheck; working: boolean; onRun: () => void }) {
  const Icon = iconMap[check.key] || ServerCog;
  const styles = check.status === "operational" ? "bg-emerald-50 text-emerald-700" : check.status === "warning" ? "bg-amber-50 text-amber-800" : check.status === "error" ? "bg-red-50 text-red-700" : "bg-stone-100 text-stone-600";
  return <article className="surface p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-start"><span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${styles}`}><Icon size={22} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-xl font-bold">{check.label}</h2><span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${styles}`}>{check.status}</span></div><p className="mt-2 text-sm leading-relaxed text-black/55">{check.detail}</p><p className="mt-2 text-[10px] text-black/35">Última verificação: {shortDateTime(check.checkedAt)}</p>{check.metadata && Object.keys(check.metadata).length > 0 && <details className="mt-3"><summary className="cursor-pointer text-xs font-bold text-basso-wine">Detalhes técnicos</summary><pre className="mt-2 overflow-x-auto rounded-xl bg-basso-paper p-3 text-[10px] text-black/60">{JSON.stringify(check.metadata, null, 2)}</pre></details>}</div><button className="btn-secondary shrink-0" disabled={working} onClick={onRun}>{working ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}Testar</button></div></article>;
}
