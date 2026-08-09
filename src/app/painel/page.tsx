"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  type LucideIcon,
  AlertTriangle,
  Bike,
  Boxes,
  CheckCircle2,
  ChefHat,
  CircleDollarSign,
  CirclePlay,
  Clock3,
  ClipboardCheck,
  ClipboardList,
  HeartPulse,
  ListChecks,
  LockKeyhole,
  Loader2,
  PackageCheck,
  Receipt,
  RefreshCw,
  ShieldQuestion,
  Store,
  Table2,
  Users,
  WalletCards,
  WifiOff,
} from "lucide-react";
import { PageHeader } from "@/components/internal/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { buildDemoControlCenter } from "@/lib/admin-control";
import { currency, isDemoMode, shortDateTime } from "@/lib/utils";
import type { ControlCenterSnapshot } from "@/types";

export default function DashboardPage() {
  const [snapshot, setSnapshot] = useState<ControlCenterSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      if (isDemoMode()) {
        setSnapshot(buildDemoControlCenter());
        return;
      }
      const response = await fetch("/api/control-center", { cache: "no-store" });
      const body = (await response.json()) as ControlCenterSnapshot & { error?: string };
      if (!response.ok) throw new Error(body.error || "Falha ao carregar o centro de comando.");
      setSnapshot(body);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar o centro de comando.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 45_000);
    const listener = () => load();
    window.addEventListener("lfb:refresh-operation", listener);
    return () => {
      clearInterval(timer);
      window.removeEventListener("lfb:refresh-operation", listener);
    };
  }, []);

  const alerts = useMemo(() => {
    if (!snapshot) return [];
    const list: Array<{ label: string; detail: string; href: string; severity: "warning" | "danger" | "info" }> = [];
    if (!snapshot.cash.open) list.push({ label: "Caixa fechado", detail: "Abra o caixa antes de registrar recebimentos do turno.", href: "/painel/caixa", severity: "danger" });
    if (snapshot.orders.delayed) list.push({ label: `${snapshot.orders.delayed} pedido(s) atrasado(s)`, detail: "A previsão de produção já foi ultrapassada.", href: "/painel/pedidos?filter=delayed", severity: "danger" });
    if (snapshot.delivery.waitingDriver) list.push({ label: `${snapshot.delivery.waitingDriver} pedido(s) aguardando motoboy`, detail: "Atribua um entregador para liberar o despacho.", href: "/painel/delivery", severity: "warning" });
    if (snapshot.stock.lowItems) list.push({ label: `${snapshot.stock.lowItems} item(ns) em estoque mínimo`, detail: "Somente bebidas e sobremesas são controladas.", href: "/painel/estoque", severity: "warning" });
    if (snapshot.reliability.failedPrintJobs) list.push({ label: `${snapshot.reliability.failedPrintJobs} falha(s) de impressão`, detail: "Reprocesse a fila ou confira o agente local.", href: "/painel/impressao", severity: "danger" });
    if (snapshot.pending.approvals) list.push({ label: `${snapshot.pending.approvals} aprovação(ões) pendente(s)`, detail: "Há ações sensíveis aguardando decisão do gestor.", href: "/painel/aprovacoes", severity: "info" });
    return list;
  }, [snapshot]);

  return (
    <>
      <PageHeader
        title="Centro de comando"
        description="Controle a operação da pizzaria em tempo real: loja, pedidos, produção, expedição, salão, delivery, caixa, equipe e confiabilidade do sistema."
        actions={<><button className="btn-secondary" onClick={load} disabled={loading}>{loading ? <Loader2 size={17} className="animate-spin" /> : <RefreshCw size={17} />}Atualizar</button><Link className="btn-secondary" href="/painel/rotinas"><ListChecks size={17} />Abrir rotina</Link><Link className="btn-primary" href="/painel/pdv"><Receipt size={17} />Nova venda</Link></>}
      />

      {error && <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700"><WifiOff className="mt-0.5 shrink-0" size={19} /><div><p>{error}</p><p className="mt-1 text-xs font-normal">Caso o erro cite tabelas novas, execute a migration 014 antes de utilizar o Mega Update 04.</p></div></div>}
      {!snapshot && loading && <div className="surface grid min-h-80 place-items-center"><div className="text-center"><Loader2 className="mx-auto animate-spin text-basso-wine" size={36} /><p className="mt-3 text-sm font-semibold text-black/45">Montando a visão operacional...</p></div></div>}

      {snapshot && (
        <>
          <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <article className={`surface p-5 ${snapshot.store.operationalStatus === "open" ? "border-emerald-200 bg-emerald-50/60" : snapshot.store.operationalStatus === "paused" ? "border-amber-200 bg-amber-50/60" : "border-stone-200 bg-stone-50"}`}>
              <div className="flex items-start justify-between"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-basso-wine shadow-sm"><Store size={21} /></span><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${snapshot.store.operationalStatus === "open" ? "bg-emerald-100 text-emerald-700" : snapshot.store.operationalStatus === "paused" ? "bg-amber-100 text-amber-800" : "bg-stone-200 text-stone-700"}`}>{snapshot.store.operationalStatus === "open" ? "Aberta" : snapshot.store.operationalStatus === "paused" ? "Pausada" : "Fechada"}</span></div>
              <p className="mt-4 text-xs font-bold uppercase tracking-[.12em] text-black/40">Estado da loja</p><p className="mt-1 font-display text-2xl font-bold">{snapshot.store.acceptingOrders ? "Recebendo pedidos" : "Pedidos bloqueados"}</p><p className="mt-2 text-xs text-black/50">Preparo {snapshot.store.preparationMinutes} min • entrega {snapshot.store.deliveryMinutes} min</p>
            </article>
            <StatCard label="Pedidos ativos" value={snapshot.orders.active} hint={`${snapshot.orders.received} novos • ${snapshot.orders.delayed} atrasados`} icon={<ClipboardList />} />
            <StatCard label="Faturamento do dia" value={currency(snapshot.orders.revenueToday)} hint={`Ticket médio ${currency(snapshot.orders.averageTicket)}`} icon={<CircleDollarSign />} />
            <StatCard label="Caixa" value={snapshot.cash.open ? "Aberto" : "Fechado"} hint={snapshot.cash.open ? `Esperado ${currency(snapshot.cash.expected)}` : "Ação necessária"} icon={<WalletCards />} />
          </section>

          <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
            <MiniMetric href="/painel/kds" icon={ChefHat} label="Em preparo" value={snapshot.orders.preparing} />
            <MiniMetric href="/painel/expedicao" icon={PackageCheck} label="Prontos" value={snapshot.orders.ready} />
            <MiniMetric href="/painel/salao" icon={Table2} label="Mesas ocupadas" value={snapshot.salon.occupiedTables} />
            <MiniMetric href="/painel/delivery" icon={Bike} label="Entregas ativas" value={snapshot.delivery.activeDeliveries} />
            <MiniMetric href="/painel/tarefas" icon={ClipboardCheck} label="Tarefas pendentes" value={snapshot.pending.tasks} />
            <MiniMetric href="/painel/diagnostico" icon={HeartPulse} label="Falhas técnicas" value={snapshot.reliability.failedPrintJobs + snapshot.reliability.failedIntegrationEvents + snapshot.reliability.pendingSync} />
          </section>

          <div className="grid gap-6 xl:grid-cols-[1.45fr_.85fr]">
            <div className="space-y-6">
              <section className="surface overflow-hidden">
                <div className="flex items-center justify-between border-b border-black/5 p-5"><div><h2 className="font-display text-2xl font-bold">Ações rápidas</h2><p className="text-sm text-black/45">Entre diretamente no fluxo operacional correto.</p></div><span className="text-[10px] font-bold text-black/35">Atualizado {shortDateTime(snapshot.generatedAt)}</span></div>
                <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                  <QuickAction href="/painel/atencao" icon={AlertTriangle} title="Ver o que precisa de atenção" detail="Atrasos, pagamentos, estoque, delivery e falhas" />
                  <QuickAction href="/painel/pedidos" icon={ClipboardList} title="Gerir pedidos" detail="Status, comanda, pagamento e comunicação" />
                  <QuickAction href="/painel/pdv" icon={Receipt} title="Nova venda" detail="Balcão, retirada, delivery ou salão" />
                  <QuickAction href="/painel/salao" icon={Table2} title="Abrir mesa" detail="Comandas, consumo e divisão de conta" />
                  <QuickAction href="/painel/expedicao" icon={PackageCheck} title="Conferir expedição" detail="Itens, bebidas, pagamento e despacho" />
                  <QuickAction href="/painel/delivery" icon={Bike} title="Atribuir motoboy" detail="Despacho e conclusão manual" />
                  <QuickAction href="/painel/caixa" icon={CircleDollarSign} title="Operar caixa" detail="Abertura, sangria, suprimento e fechamento" />
                  <QuickAction href="/painel/estoque" icon={Boxes} title="Movimentar estoque" detail="Bebidas e sobremesas" />
                  <QuickAction href="/painel/tarefas" icon={ClipboardCheck} title="Criar tarefa" detail="Responsável, prazo e prioridade" />
                  <QuickAction href="/painel/diagnostico" icon={HeartPulse} title="Diagnosticar sistema" detail="Banco, filas, impressão e migrations" />
                </div>
              </section>

              <section className="surface overflow-hidden">
                <div className="border-b border-black/5 p-5"><h2 className="font-display text-2xl font-bold">Pulso operacional</h2><p className="text-sm text-black/45">Indicadores que orientam a próxima ação da equipe.</p></div>
                <div className="grid gap-px bg-black/5 sm:grid-cols-2 lg:grid-cols-4">
                  <Pulse label="Não visualizados" value={snapshot.orders.unviewed} detail="pedidos aguardando primeira leitura" />
                  <Pulse label="Pagamento pendente" value={snapshot.orders.unpaid} detail="pedidos ativos sem quitação total" />
                  <Pulse label="Comandas abertas" value={snapshot.salon.openTabs} detail="no salão" />
                  <Pulse label="Motoboys disponíveis" value={`${snapshot.delivery.availableDrivers}/${snapshot.delivery.totalDrivers}`} detail="cadastros ativos" />
                  <Pulse label="Concluídos hoje" value={snapshot.orders.completedToday} detail="pedidos encerrados" />
                  <Pulse label="Cancelados hoje" value={snapshot.orders.cancelledToday} detail="exigem análise de motivo" />
                  <Pulse label="Usuários ativos" value={snapshot.people.activeUsers} detail="vistos nos últimos 15 minutos" />
                  <Pulse label="Ocorrências abertas" value={snapshot.pending.incidents} detail="em pedidos e operação" />
                </div>
              </section>
            </div>

            <aside className="space-y-6">
              <section className="surface overflow-hidden">
                <div className="flex items-center justify-between border-b border-black/5 p-5"><div><h2 className="font-display text-xl font-bold">Atenção necessária</h2><p className="text-xs text-black/45">Prioridades do momento</p></div><AlertTriangle className={alerts.length ? "text-amber-700" : "text-emerald-600"} /></div>
                <div className="p-3">
                  {alerts.map((alert) => <Link key={alert.label} href={alert.href} className={`mb-2 block rounded-2xl border p-3 transition hover:shadow-sm ${alert.severity === "danger" ? "border-red-200 bg-red-50" : alert.severity === "warning" ? "border-amber-200 bg-amber-50" : "border-blue-200 bg-blue-50"}`}><p className="text-sm font-bold">{alert.label}</p><p className="mt-1 text-xs text-black/55">{alert.detail}</p></Link>)}
                  {!alerts.length && <div className="grid min-h-44 place-items-center text-center"><div><CheckCircle2 className="mx-auto text-emerald-600" size={36} /><p className="mt-3 font-bold">Operação sem alertas críticos</p><p className="mt-1 text-xs text-black/45">Continue acompanhando pedidos e produção.</p></div></div>}
                </div>
              </section>

              <section className="surface p-5">
                <h2 className="flex items-center gap-2 font-display text-xl font-bold"><Clock3 className="text-basso-wine" />Próxima rotina</h2>
                <p className="mt-2 text-sm text-black/50">Use a abertura guiada antes de iniciar o atendimento e o fechamento guiado para não deixar pedidos, mesas, caixa ou entregas pendentes.</p>
                <div className="mt-4 grid gap-2"><Link href="/painel/rotinas?phase=opening" className="btn-secondary"><CirclePlay size={16} />Rotina de abertura</Link><Link href="/painel/rotinas?phase=closing" className="btn-secondary"><LockKeyhole size={16} />Rotina de fechamento</Link></div>
              </section>

              <section className="surface p-5"><h2 className="flex items-center gap-2 font-display text-xl font-bold"><Users className="text-basso-wine" />Coordenação</h2><div className="mt-4 grid grid-cols-3 gap-2"><Link href="/painel/tarefas" className="rounded-xl bg-basso-paper p-3 text-center"><strong className="block text-xl">{snapshot.pending.tasks}</strong><span className="text-[10px] text-black/45">Tarefas</span></Link><Link href="/painel/aprovacoes" className="rounded-xl bg-basso-paper p-3 text-center"><strong className="block text-xl">{snapshot.pending.approvals}</strong><span className="text-[10px] text-black/45">Aprovações</span></Link><Link href="/painel/notificacoes" className="rounded-xl bg-basso-paper p-3 text-center"><strong className="block text-xl">{snapshot.pending.notifications}</strong><span className="text-[10px] text-black/45">Alertas</span></Link></div></section>
            </aside>
          </div>
        </>
      )}
    </>
  );
}


function MiniMetric({ href, icon: Icon, label, value }: { href: string; icon: LucideIcon; label: string; value: number | string }) {
  return <Link href={href} className="surface flex items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:border-basso-gold/40 hover:shadow-sm"><span className="grid h-10 w-10 place-items-center rounded-xl bg-basso-cream text-basso-wine"><Icon size={18} /></span><div><p className="text-xl font-black">{value}</p><p className="text-[10px] font-bold uppercase tracking-[.1em] text-black/40">{label}</p></div></Link>;
}
function QuickAction({ href, icon: Icon, title, detail }: { href: string; icon: LucideIcon; title: string; detail: string }) {
  return <Link href={href} className="group flex items-center gap-3 rounded-2xl border border-black/5 bg-basso-paper/60 p-3 transition hover:border-basso-gold/40 hover:bg-white"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-basso-wine shadow-sm transition group-hover:bg-basso-wine group-hover:text-white"><Icon size={18} /></span><div className="min-w-0"><p className="text-sm font-bold">{title}</p><p className="truncate text-[11px] text-black/45">{detail}</p></div></Link>;
}
function Pulse({ label, value, detail }: { label: string; value: number | string; detail: string }) {
  return <div className="bg-white p-5"><p className="text-[10px] font-black uppercase tracking-[.12em] text-black/35">{label}</p><p className="mt-2 font-display text-3xl font-bold">{value}</p><p className="mt-1 text-xs text-black/45">{detail}</p></div>;
}
