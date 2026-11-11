"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { saoPauloDate } from "@/lib/report-period";
import { BarChart3, Download, RefreshCw, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/internal/PageHeader";
import { VendraAssinatura } from "@/components/shared/Vendra";
import { StatCard } from "@/components/ui/StatCard";
import { useDemoState } from "@/lib/demo-store";
import { channelLabel } from "@/lib/order-validation";
import { currency, isDemoMode } from "@/lib/utils";

interface ReportData { period:{start:string;end:string};summary:{orders:number;paidOrders:number;cancelledOrders:number;revenue:number;discounts:number;deliveryFees:number;averageTicket:number;averageRating:number|null;financialIncome:number;financialExpense:number;estimatedResult:number};byChannel:Record<string,{orders:number;revenue:number}>;byPayment:Record<string,{orders:number;revenue:number}>;byDay:Array<{date:string;orders:number;revenue:number}>;topProducts:Array<{name:string;quantity:number;revenue:number}>;topAddons:Array<{id:string;quantity:number}>; }

export default function ReportsPage() {
  const orders = useDemoState(s => s.orders);
  const entries = useDemoState(s => s.financialEntries);
  const today = saoPauloDate();
  const monthStart = `${today.slice(0, 7)}-01`;
  const [start, setStart] = useState(monthStart);
  const [end, setEnd] = useState(today);
  const [remote, setRemote] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const requestId = useRef(0);

  const demoReport = useMemo<ReportData>(() => {
    const range = orders.filter(order => saoPauloDate(order.createdAt) >= start && saoPauloDate(order.createdAt) <= end);
    const valid = range.filter(order => order.status !== "cancelled");
    const paid = valid.filter(order => order.paymentStatus === "paid");
    const revenue = paid.reduce((sum, order) => sum + order.total, 0);
    const byChannel:ReportData["byChannel"]={}; const byPayment:ReportData["byPayment"]={}; const byDayMap:Record<string,{orders:number;revenue:number}>={}; const products:Record<string,{quantity:number;revenue:number}>={}; const addons:Record<string,number>={};
    for(const order of paid){byChannel[order.channel]||={orders:0,revenue:0};byChannel[order.channel].orders++;byChannel[order.channel].revenue+=order.total;byPayment[order.paymentMethod]||={orders:0,revenue:0};byPayment[order.paymentMethod].orders++;byPayment[order.paymentMethod].revenue+=order.total;const day=saoPauloDate(order.createdAt);byDayMap[day]||={orders:0,revenue:0};byDayMap[day].orders++;byDayMap[day].revenue+=order.total;for(const item of order.items){if((item as {productionStatus?:string}).productionStatus==="cancelled")continue;products[item.name]||={quantity:0,revenue:0};products[item.name].quantity+=item.quantity;products[item.name].revenue+=item.quantity*item.unitPrice;if(item.selection&&"addons" in item.selection)for(const [id,q] of Object.entries(item.selection.addons))addons[id]=(addons[id]||0)+Number(q)*item.quantity}}
    const settled=entries.filter(entry=>entry.status==="settled"&&entry.dueDate>=start&&entry.dueDate<=end);const income=settled.filter(entry=>entry.kind==="income").reduce((s,e)=>s+e.amount,0);const expense=settled.filter(entry=>entry.kind==="expense").reduce((s,e)=>s+e.amount,0);
    return {period:{start,end},summary:{orders:valid.length,paidOrders:paid.length,cancelledOrders:range.length-valid.length,revenue,discounts:valid.reduce((s,o)=>s+o.discount,0),deliveryFees:valid.reduce((s,o)=>s+o.deliveryFee,0),averageTicket:paid.length?Math.round(revenue/paid.length):0,averageRating:null,financialIncome:income,financialExpense:expense,estimatedResult:income-expense},byChannel,byPayment,byDay:Object.entries(byDayMap).map(([date,m])=>({date,...m})).sort((a,b)=>a.date.localeCompare(b.date)),topProducts:Object.entries(products).map(([name,m])=>({name,...m})).sort((a,b)=>b.quantity-a.quantity).slice(0,10),topAddons:Object.entries(addons).map(([id,quantity])=>({id,quantity})).sort((a,b)=>b.quantity-a.quantity).slice(0,10)};
  }, [orders, entries, start, end]);

  async function load() {
    if(isDemoMode()){setRemote(null);return;}
    const current = ++requestId.current;
    setLoading(true);setError("");setRemote(null);
    try {
      const response=await fetch(`/api/reports?start=${start}&end=${end}`,{cache:"no-store"});
      const body=await response.json();
      if(!response.ok)throw new Error(body.error||"Falha ao gerar relatório.");
      if(current===requestId.current)setRemote(body);
    } catch(e) { if(current===requestId.current)setError(e instanceof Error?e.message:"Falha ao gerar relatório."); }
    finally { if(current===requestId.current)setLoading(false); }
  }
  useEffect(()=>{void load()},[start,end]);
  const report=isDemoMode()?demoReport:remote;
  async function exportCsv() {
    setExporting(true);setError("");
    try {
      let blob: Blob;
      if(!isDemoMode()) {
        const response=await fetch(`/api/reports?start=${start}&end=${end}&format=csv`,{cache:"no-store"});
        if(!response.ok) { const body=await response.json(); throw new Error(body.error||"Falha ao exportar relatório."); }
        blob=await response.blob();
      } else {
        const rows=[["Data","Canal","Status","Pagamento","Total (centavos)"],...orders.filter(o=>saoPauloDate(o.createdAt)>=start&&saoPauloDate(o.createdAt)<=end).map(o=>[o.createdAt,o.channel,o.status,o.paymentMethod,o.total])];
        blob=new Blob(["\ufeff"+rows.map(row=>row.map(v=>`"${String(v).replaceAll('"','""')}"`).join(";")).join("\r\n")],{type:"text/csv;charset=utf-8"});
      }
      const url=URL.createObjectURL(blob), a=document.createElement("a");
      a.href=url;a.download=`relatorio-la-forneria-${start}-${end}.csv`;a.click();URL.revokeObjectURL(url);
    } catch(e) { setError(e instanceof Error?e.message:"Falha ao exportar relatório."); }
    finally { setExporting(false); }
  }
  return <>
    <PageHeader title="Relatórios e indicadores" icon={BarChart3} description="Vendas, canais, produtos, pagamentos, cancelamentos, clientes, produção, delivery e exportação por período." actions={<><button className="btn-secondary" onClick={load} disabled={loading}><RefreshCw size={17} className={loading?"animate-spin":""}/>Atualizar</button><button className="btn-secondary" onClick={()=>void exportCsv()} disabled={loading||exporting||!report}><Download size={17}/>Exportar Excel/CSV</button><button className="btn-secondary" disabled={loading||!report} onClick={()=>window.print()}><Download size={17}/>Salvar PDF</button></>} />
    <div className="surface mb-5 grid gap-4 p-4 sm:grid-cols-2 lg:max-w-xl"><label><span className="label">Início</span><input type="date" className="input" value={start} onChange={e=>setStart(e.target.value)}/></label><label><span className="label">Fim</span><input type="date" className="input" value={end} onChange={e=>setEnd(e.target.value)}/></label></div>
    {error&&<p className="mb-5 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</p>}
    {!report?<p className="surface p-8 text-center text-sm">{loading?"Carregando relatório…":"Relatório indisponível. Corrija o período ou tente atualizar novamente."}</p>:<>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5"><StatCard label="Pedidos válidos" value={report.summary.orders} icon={<BarChart3/>}/><StatCard label="Faturamento pago" value={currency(report.summary.revenue)} icon={<TrendingUp/>}/><StatCard label="Ticket médio" value={currency(report.summary.averageTicket)} icon={<TrendingUp/>}/><StatCard label="Cancelados" value={report.summary.cancelledOrders} icon={<BarChart3/>}/><StatCard label="Avaliação média" value={report.summary.averageRating??"Sem dados"} icon={<TrendingUp/>}/></div>
    <div className="mt-6 grid gap-6 xl:grid-cols-2"><Panel title="Vendas por canal"><div className="space-y-3">{Object.entries(report.byChannel).sort((a,b)=>b[1].revenue-a[1].revenue).map(([channel,m])=><Bar key={channel} label={channelLabel[channel as keyof typeof channelLabel]||channel} value={m.revenue} max={report.summary.revenue} detail={`${m.orders} pedido(s)`}/>)}</div></Panel><Panel title="Formas de pagamento"><div className="space-y-3">{Object.entries(report.byPayment).sort((a,b)=>b[1].revenue-a[1].revenue).map(([method,m])=><Bar key={method} label={paymentLabel(method)} value={m.revenue} max={report.summary.revenue} detail={`${m.orders} pedido(s)`}/>)}</div></Panel><Panel title="Produtos mais vendidos"><div className="divide-y divide-black/5">{report.topProducts.map((item,index)=><div key={item.name} className="flex items-center gap-4 py-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-basso-cream text-sm font-black text-basso-wine">{index+1}</span><div className="min-w-0 flex-1"><strong className="line-clamp-1 text-sm">{item.name}</strong><p className="text-xs text-black/40">{currency(item.revenue)}</p></div><strong>{item.quantity} un.</strong></div>)}{!report.topProducts.length&&<p className="py-6 text-center text-sm text-black/45">Sem vendas no período.</p>}</div></Panel><Panel title="Resumo financeiro do período"><div className="space-y-3"><Metric label="Receitas liquidadas" value={report.summary.financialIncome}/><Metric label="Despesas liquidadas" value={-report.summary.financialExpense}/><Metric label="Resultado financeiro" value={report.summary.estimatedResult}/><Metric label="Descontos concedidos" value={-report.summary.discounts}/><Metric label="Taxas de entrega cobradas" value={report.summary.deliveryFees}/></div></Panel></div>
    </>}
    <div className="mt-8 flex justify-center"><VendraAssinatura variante="claro" altura={14} /></div>
  </>;
}
function Panel({title,children}:{title:string;children:React.ReactNode}){return <section className="surface p-5"><h2 className="font-display text-xl font-bold">{title}</h2><div className="mt-4">{children}</div></section>}
function Bar({label,value,max,detail}:{label:string;value:number;max:number;detail:string}){const width=max?Math.max(3,Math.round(value/max*100)):0;return <div><div className="flex justify-between gap-3 text-sm"><strong>{label}</strong><span>{currency(value)} • {detail}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-black/5"><div className="h-full rounded-full bg-basso-wine" style={{width:`${width}%`}}/></div></div>}
function Metric({label,value}:{label:string;value:number}){return <div className="flex justify-between rounded-xl bg-basso-paper px-4 py-3"><span className="text-sm">{label}</span><strong className={value<0?"text-red-700":"text-emerald-700"}>{currency(value)}</strong></div>}
function paymentLabel(value:string){return ({pix:"Pix",cash:"Dinheiro",debit:"Débito",credit:"Crédito",meal_voucher:"Vale-refeição",food_voucher:"Vale-alimentação"} as Record<string,string>)[value]||value}
