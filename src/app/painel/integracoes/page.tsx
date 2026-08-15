"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, CloudCog, PlugZap, RefreshCw, Settings2, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/internal/PageHeader";
import { useDemoState } from "@/lib/demo-store";
import { isDemoMode, shortDateTime } from "@/lib/utils";

type HealthState = "awaiting_credentials" | "configured" | "operational" | "failed" | "awaiting_official_contract";
type ProviderState = { configured: boolean; ok?: boolean; detail?: string; checkedAt?: string; state?: HealthState };

const providers = [
  { id: "ifood", name: "iFood", cap: "Pedidos, status e cancelamentos", configHref: "/painel/configuracoes" },
  { id: "99food", name: "99Food", cap: "Sandbox, pedidos, status, cancelamentos e fila idempotente", configHref: "/painel/integracoes/99food" },
  { id: "tracking", name: "Rastreamento", cap: "Turno do motoboy, GPS interno e link temporário do cliente", configHref: "/painel/motoboy" },
  { id: "laranjinha", name: "Laranjinha Smart", cap: "Base SmartPOS do garçom + pagamento integrado após homologação", configHref: "/painel/garcom?mode=smartpos" },
  { id: "onesignal", name: "OneSignal", cap: "Push segmentado e histórico de falhas", configHref: "/painel/configuracoes" },
  { id: "printer", name: "Impressoras", cap: "Epson e impressora chinesa por setor", configHref: "/painel/impressao" },
] as const;

function stateLabel(state: ProviderState | undefined) {
  if (state?.state === "operational" || state?.ok === true) return "Operacional";
  if (state?.state === "awaiting_official_contract") return "Aguardando homologação/documentação";
  if (state?.state === "configured") return "Base configurada";
  if (state?.state === "failed" || state?.ok === false && state?.configured) return "Falha / bloqueada";
  if (state?.configured) return "Configurada";
  return "Aguardando credenciais";
}

function stateClass(state: ProviderState | undefined) {
  if (state?.state === "operational" || state?.ok === true) return "bg-emerald-50 text-emerald-700";
  if (state?.state === "failed") return "bg-red-50 text-red-700";
  return "bg-amber-50 text-amber-800";
}

export default function IntegrationsPage() {
  const storedEvents = useDemoState((state) => state.integrationEvents);
  const [events, setEvents] = useState(storedEvents);
  const [health, setHealth] = useState<Record<string, ProviderState>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [logsProvider, setLogsProvider] = useState<string | null>(null);

  useEffect(() => setEvents(storedEvents), [storedEvents]);
  useEffect(() => {
    if (isDemoMode()) {
      setHealth(Object.fromEntries(providers.map((provider) => [provider.id, {
        configured: ["tracking", "printer"].includes(provider.id),
        ok: provider.id === "tracking" || provider.id === "printer",
        state: provider.id === "tracking" || provider.id === "printer" ? "operational" : "awaiting_credentials",
        detail: provider.id === "tracking" ? "Rastreamento de demonstração disponível" : provider.id === "printer" ? "Bridge de demonstração disponível" : "Aguardando configuração externa",
      }])));
      return;
    }
    fetch("/api/integrations/health", { cache: "no-store" })
      .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); setHealth(body.providers || {}); })
      .catch((error) => setMessage(error instanceof Error ? error.message : "Falha ao consultar integrações."));
  }, []);

  async function test(provider: string) {
    setTesting(provider); setMessage("");
    try {
      if (isDemoMode()) {
        await new Promise((resolve) => setTimeout(resolve, 350));
      } else {
        const response = await fetch(`/api/integrations/health?live=true&provider=${provider}`, { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Falha no teste.");
        setHealth((current) => ({ ...current, [provider]: body.providers[provider] }));
      }
      setMessage("Diagnóstico concluído. O cartão mostra o estado real da integração.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha no teste."); }
    finally { setTesting(null); }
  }

  async function retry(id: string) {
    try {
      if (!isDemoMode()) {
        const response = await fetch(`/api/integrations/events/${id}/retry`, { method: "POST" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Falha ao reprocessar.");
      }
      setEvents((list) => list.map((event) => event.id === id ? { ...event, status: "pending", attempts: event.attempts + 1 } : event));
      setMessage("Evento devolvido à fila idempotente.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao reprocessar."); }
  }

  const visibleEvents = logsProvider ? events.filter((event) => event.provider.toLowerCase().includes(logsProvider.toLowerCase())) : events;

  return <>
    <PageHeader title="Integrações e diagnóstico" icon={CloudCog} description="Cada integração mostra o estado real: pronta, bloqueada por credenciais/documentação ou operacional. Nenhum fornecedor é exibido como conectado sem teste real." />
    {message && <p className="mb-5 rounded-xl bg-blue-50 p-4 text-sm font-semibold text-blue-800">{message}</p>}

    <div className="grid gap-4 xl:grid-cols-2">{providers.map((provider) => {
      const state = health[provider.id];
      return <article key={provider.id} className="surface p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-basso-cream text-basso-wine"><PlugZap /></span><div><h2 className="font-display text-xl font-bold">{provider.name}</h2><p className="text-xs text-black/45">{provider.cap}</p></div></div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${stateClass(state)}`}>{stateLabel(state)}</span>
        </div>
        <p className="mt-4 min-h-12 text-xs text-black/50">{state?.detail || "Diagnóstico ainda não executado."}{state?.checkedAt && <><br />Último teste: {shortDateTime(state.checkedAt)}</>}</p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Link className="btn-secondary min-h-9 text-xs" href={provider.configHref}><Settings2 size={14} />Configurar</Link>
          <button className="btn-secondary min-h-9 text-xs" onClick={() => test(provider.id)} disabled={testing === provider.id}><RefreshCw size={14} className={testing === provider.id ? "animate-spin" : ""} />{testing === provider.id ? "Testando" : "Testar"}</button>
          <button className="btn-secondary min-h-9 text-xs" onClick={() => setLogsProvider((current) => current === provider.name ? null : provider.name)}><CloudCog size={14} />Logs</button>
        </div>
      </article>;
    })}</div>

    <section className="surface mt-6 overflow-hidden">
      <div className="flex items-center justify-between border-b p-5"><h2 className="font-display text-xl font-bold">Eventos recentes {logsProvider && `• ${logsProvider}`}</h2>{logsProvider && <button className="btn-ghost" onClick={() => setLogsProvider(null)}>Mostrar todos</button>}</div>
      <div className="divide-y divide-black/5">{visibleEvents.map((event) => <div key={event.id} className="flex items-center gap-4 p-4">{event.status === "ok" ? <CheckCircle2 className="text-emerald-600" /> : <TriangleAlert className={event.status === "error" ? "text-red-600" : "text-amber-600"} />}<div className="flex-1"><strong className="text-sm">{event.provider} • {event.type}</strong><p className="text-xs text-black/40">{shortDateTime(event.createdAt)} • tentativa {event.attempts}</p></div>{event.status !== "ok" && <button className="btn-ghost" onClick={() => retry(event.id)}><RefreshCw size={16} />Reprocessar</button>}</div>)}{!visibleEvents.length && <p className="p-6 text-center text-sm text-black/45">Nenhum evento para o filtro atual.</p>}</div>
    </section>

    <p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm font-semibold text-amber-900">A 99Food já possui rota e arquitetura próprias, mas chamadas reais continuam bloqueadas até aplicarmos os trechos oficiais de autenticação, assinatura, eventos e endpoints. A Laranjinha Smart também permanece bloqueada até o SDK/App2App oficial e a certificação.</p>
  </>;
}
