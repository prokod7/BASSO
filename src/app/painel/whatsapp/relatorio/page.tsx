import Link from "next/link";
import { PageHeader } from "@/components/internal/PageHeader";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const periods = [{ days: 1, label: "Hoje" }, { days: 7, label: "7 dias" }, { days: 30, label: "30 dias" }, { days: 0, label: "Todo o histórico" }];
const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function RobotReport({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  try { await requireOperationalRole(["manager", "viewer", "counter"], "orders.view"); }
  catch { return <p role="alert">Você precisa de acesso aos pedidos para consultar o relatório.</p>; }
  const selected = (await searchParams).dias;
  const days = periods.find(period => String(period.days) === selected)?.days ?? 7;
  const db = createAdminClient();
  const result = await db?.rpc("wa_robot_report", { period_days: days });
  const r = result?.data;
  const metrics: [string, number | string][] = r ? [
    ["Mensagens recebidas", r.received], ["Contatos que escreveram", r.contacts],
    ["Mensagens enviadas pelo robô", r.sent], ["Falhas de envio do robô", r.failed], ["Mensagens da equipe", r.human],
    ["Clientes que fecharam", r.buyers], ["Pedidos registrados pelo robô", r.orders],
    ["Valor dos pedidos", brl(r.revenue)], ["Ticket médio", r.orders ? brl(r.revenue / r.orders) : "—"],
  ] : [];
  return <main className="space-y-5">
    <PageHeader title="Relatório do robô" description="Atendimento e pedidos pelo WhatsApp da Basso."
      actions={<Link href="/painel/whatsapp" className="btn-secondary">Voltar às conversas</Link>} />
    <nav aria-label="Período do relatório" className="flex flex-wrap gap-2">{periods.map(p =>
      <Link key={p.days} href={`?dias=${p.days}`} aria-current={days === p.days ? "page" : undefined}
        className={days === p.days ? "btn-primary" : "btn-secondary"}>{p.label}</Link>)}</nav>
    {result?.error || !r ? <p role="alert">Não foi possível carregar o relatório. Atualize a página para tentar novamente.</p> : <>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-3">{metrics.map(([label,value]) =>
        <div className="surface p-4" key={label}><dt className="text-sm">{label}</dt>
          <dd className="mt-2 text-2xl font-bold">{value.toLocaleString("pt-BR")}</dd></div>)}</dl>
      <p className="text-sm">O período segue o horário de São Paulo. Cada cliente conta uma vez por número de WhatsApp. O valor soma os pedidos vinculados ao robô e exclui cancelados e excluídos.</p>
      <section className="surface p-4"><h2 className="font-bold">Em fechamento agora</h2>
        <p>{r.carts} carrinho(s) aguardando confirmação · <strong>{brl(r.pipeline)}</strong></p>
        <p className="mt-1 text-sm">Orçamentos ativos no momento da consulta, independentemente do período selecionado.</p></section>
    </>}
  </main>;
}
