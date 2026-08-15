"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Clipboard, RefreshCw, ShieldAlert, UtensilsCrossed } from "lucide-react";
import { PageHeader } from "@/components/internal/PageHeader";

interface Food99Status {
  environment: "test" | "production";
  appShopId: string;
  webhookUrl: string;
  configured: boolean;
  operational: boolean;
  state: string;
  credentials: Record<string, "configured" | "missing">;
  missingEnv: string[];
  blocker?: string;
  officialDocumentationNeeded: string[];
  recentEvents: Array<{ id: string; event_type: string; status: string; attempts: number; created_at: string; correlation_id?: string; last_error?: string }>;
}

export default function Food99ConfigurationPage() {
  const [status, setStatus] = useState<Food99Status | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true); setMessage("");
    try {
      const response = await fetch("/api/integrations/99food/status", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Falha ao consultar 99Food.");
      setStatus(body);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao consultar 99Food."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  async function test() {
    setMessage("");
    const response = await fetch("/api/integrations/health?live=true&provider=99food", { cache: "no-store" });
    const body = await response.json();
    setMessage(body.providers?.["99food"]?.detail || body.error || "Teste concluído.");
    await load();
  }

  return <>
    <PageHeader title="99Food • PedidoPro" icon={UtensilsCrossed} description="Aplicativo PedidoPro 99Food Teste • Ambiente Sandbox • AppShopID basso_teste_001" actions={<button className="btn-secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={17} className={loading ? "animate-spin" : ""} />Atualizar</button>} />
    {message && <p className="mb-5 rounded-xl bg-blue-50 p-4 text-sm font-semibold text-blue-800">{message}</p>}

    <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
      <div className="space-y-5">
        <section className="surface p-5">
          <div className="flex items-center justify-between gap-4"><div><p className="text-xs font-black uppercase text-basso-wine">Estado da integração</p><h2 className="mt-1 font-display text-2xl font-bold">{status?.operational ? "Operacional" : status?.configured ? "Credenciais presentes • contrato oficial pendente" : "Aguardando credenciais"}</h2></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${status?.operational ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{status?.environment === "production" ? "PRODUÇÃO" : "TESTE"}</span></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">{Object.entries(status?.credentials || {}).map(([key, value]) => <div key={key} className="rounded-xl border p-3"><p className="text-[10px] font-bold uppercase text-black/40">{key}</p><p className={`mt-1 flex items-center gap-2 text-sm font-bold ${value === "configured" ? "text-emerald-700" : "text-amber-700"}`}>{value === "configured" && <CheckCircle2 size={16} />}{value === "configured" ? "Configurado" : "Faltando"}</p></div>)}</div>
        </section>

        <section className="surface p-5">
          <h2 className="font-display text-xl font-bold">Webhook cadastrado</h2>
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-basso-paper p-3"><code className="min-w-0 flex-1 break-all text-xs">{status?.webhookUrl || "https://basso-seven.vercel.app/api/integrations/99food/webhook"}</code><button className="btn-ghost" onClick={() => navigator.clipboard.writeText(status?.webhookUrl || "https://basso-seven.vercel.app/api/integrations/99food/webhook")}><Clipboard size={15} />Copiar</button></div>
          <p className="mt-3 text-xs text-black/50">A rota existe. POSTs reais são recusados enquanto a validação oficial de autenticidade do webhook não estiver implementada a partir da documentação da 99Food.</p>
        </section>

        <section className="surface p-5">
          <h2 className="font-display text-xl font-bold">Eventos 99Food</h2>
          <div className="mt-4 divide-y divide-black/5 rounded-xl border">{status?.recentEvents?.map((event) => <div key={event.id} className="p-3"><div className="flex items-center justify-between gap-3"><strong className="text-sm">{event.event_type}</strong><span className="text-xs font-bold uppercase text-black/45">{event.status}</span></div><p className="mt-1 text-xs text-black/40">Tentativas: {event.attempts}{event.correlation_id ? ` • ${event.correlation_id}` : ""}</p>{event.last_error && <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700">{event.last_error}</p>}</div>)}{!status?.recentEvents?.length && <p className="p-5 text-sm text-black/45">Nenhum evento 99Food recebido.</p>}</div>
        </section>
      </div>

      <aside className="space-y-5">
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="flex items-center gap-2 font-bold text-amber-900"><ShieldAlert size={19} />Bloqueio de segurança</p>
          <p className="mt-2 text-sm text-amber-900/80">{status?.blocker || "As chamadas externas só serão ativadas depois de aplicarmos o contrato oficial da Plataforma Aberta 99Food."}</p>
          <button className="btn-secondary mt-4 w-full" onClick={() => void test()}><RefreshCw size={16} />Testar configuração</button>
        </section>
        <section className="surface p-5"><h2 className="font-display text-lg font-bold">Documentação que falta fornecer</h2><ol className="mt-3 space-y-2 text-sm text-black/60">{(status?.officialDocumentationNeeded || []).map((item, index) => <li key={item}><strong>{index + 1}.</strong> {item}</li>)}</ol></section>
      </aside>
    </div>
  </>;
}
