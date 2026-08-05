"use client";
import Link from "next/link";
import { AlertTriangle, Bike, ChefHat, CircleDollarSign, Clock3, PackageCheck, Receipt, ShoppingBag, Users } from "lucide-react";
import { PageHeader } from "@/components/internal/PageHeader";
import { OrderCard } from "@/components/internal/OrderCard";
import { StatCard } from "@/components/ui/StatCard";
import { useDemoState } from "@/lib/demo-store";
import { currency } from "@/lib/utils";
export default function DashboardPage() {
  const orders = useDemoState(s => s.orders);
  const tables = useDemoState(s => s.tables);
  const inventory = useDemoState(s => s.inventory);
  const drivers = useDemoState(s => s.drivers);
  const active = orders.filter(o => !["completed","cancelled"].includes(o.status));
  const revenue = orders.filter(o => o.paymentStatus === "paid").reduce((sum,o)=>sum+o.total,0);
  const low = inventory.filter(i => i.quantity <= i.minQuantity);
  return <>
    <PageHeader title="Central de operação" description="Visão consolidada de pedidos, salão, produção, delivery, estoque e caixa em tempo real." actions={<><Link className="btn-secondary" href="/painel/pdv"><ShoppingBag size={17}/>Nova venda</Link><Link className="btn-primary" href="/painel/pedidos"><Receipt size={17}/>Abrir pedidos</Link></>}/>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Pedidos ativos" value={active.length} hint="Todos os canais" icon={<PackageCheck/>}/><StatCard label="Faturamento registrado" value={currency(revenue)} hint="Pedidos pagos da base atual" icon={<CircleDollarSign/>}/><StatCard label="Mesas ocupadas" value={`${tables.filter(t=>t.status!=="free").length}/15`} hint="10 mesas de 5 e 5 de 2 lugares" icon={<Users/>}/><StatCard label="Motoboys disponíveis" value={`${drivers.filter(d=>d.available).length}/${drivers.length}`} hint="PWA e geolocalização durante entrega" icon={<Bike/>}/></div>
    <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_.8fr]">
      <section><div className="mb-4 flex items-center justify-between"><div><h2 className="font-display text-2xl font-bold">Pedidos que exigem atenção</h2><p className="text-sm text-black/45">Atualize o fluxo diretamente pelos cartões.</p></div><Link href="/painel/pedidos" className="btn-ghost">Ver todos</Link></div><div className="grid gap-4 lg:grid-cols-2">{active.slice(0,4).map(o => <OrderCard key={o.id} order={o} compact/>)}</div></section>
      <aside className="space-y-4"><div className="surface p-5"><h2 className="flex items-center gap-2 font-display text-xl font-bold"><ChefHat className="text-basso-wine"/>Pulso da cozinha</h2><div className="mt-5 space-y-3"><Metric label="Recebidos" value={orders.filter(o=>o.status==="received").length}/><Metric label="Em preparo" value={orders.filter(o=>o.status==="preparing").length}/><Metric label="Prontos" value={orders.filter(o=>o.status==="ready").length}/></div><Link href="/painel/kds" className="btn-secondary mt-5 w-full">Abrir KDS</Link></div><div className={`surface p-5 ${low.length ? "border-amber-200 bg-amber-50" : ""}`}><h2 className="flex items-center gap-2 font-display text-xl font-bold"><AlertTriangle className={low.length ? "text-amber-700" : "text-emerald-700"}/>Estoque restrito</h2><p className="mt-2 text-sm text-black/55">{low.length ? `${low.length} bebida(s) ou sobremesa(s) chegaram ao estoque mínimo.` : "Nenhum item abaixo do mínimo."}</p><Link href="/painel/estoque" className="btn-ghost mt-3 px-0">Conferir estoque</Link></div><div className="surface p-5"><h2 className="flex items-center gap-2 font-display text-xl font-bold"><Clock3 className="text-basso-wine"/>Operação</h2><p className="mt-2 text-sm text-black/55">Terça a domingo, 18h às 23h. Segunda-feira fechada.</p></div></aside>
    </div>
  </>;
}
function Metric({label,value}:{label:string;value:number}){return <div className="flex items-center justify-between rounded-xl bg-basso-paper px-3 py-2"><span className="text-sm text-black/55">{label}</span><strong>{value}</strong></div>}
