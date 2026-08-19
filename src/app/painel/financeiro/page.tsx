"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, CircleDollarSign, CreditCard, Download, Loader2, Plus, RefreshCw, Wallet, X } from "lucide-react";
import { PageHeader } from "@/components/internal/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { useDemoState, demoActions } from "@/lib/demo-store";
import { apiJson, formatApiError, requestOperationalRefresh } from "@/lib/client/api";
import { currency, isDemoMode, shortDateTime, uid } from "@/lib/utils";
import type { FinancialEntry, PaymentMethod } from "@/types";

type Category = { id: string; name: string; kind: "income" | "expense"; active: boolean };
type FinanceResponse = { entries: FinancialEntry[]; categories: Category[]; summary: { settledIncome: number; settledExpense: number; pendingIncome: number; pendingExpense: number } };
const demoCategories: Category[] = [
  {id:"demo-income-sales",name:"Vendas",kind:"income",active:true},{id:"demo-income-other",name:"Receitas diversas",kind:"income",active:true},
  {id:"demo-exp-ops",name:"Operação",kind:"expense",active:true},{id:"demo-exp-fees",name:"Taxas",kind:"expense",active:true},{id:"demo-exp-supplies",name:"Insumos",kind:"expense",active:true}
];

export default function FinancePage() {
  const orders = useDemoState((state) => state.orders);
  const snapshotEntries = useDemoState((state) => state.financialEntries);
  const [remote, setRemote] = useState<FinanceResponse | null>(null);
  const [creating, setCreating] = useState(false);
  const [kind, setKind] = useState<"income" | "expense">("expense");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState("");
  const [settleEntry, setSettleEntry] = useState<FinancialEntry | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix");

  const entries = remote?.entries ?? snapshotEntries;
  const categories = remote?.categories ?? demoCategories;
  const kindCategories = categories.filter((item) => item.kind === kind);
  useEffect(() => { if (!kindCategories.some((item)=>item.id===categoryId)) setCategoryId(kindCategories[0]?.id || ""); }, [kind, categories, categoryId]);

  const revenue = orders.filter((order) => order.paymentStatus === "paid" && order.status !== "cancelled").reduce((sum, order) => sum + order.total, 0);
  const settledIncome = entries.filter((entry) => entry.kind === "income" && entry.status === "settled").reduce((sum, entry) => sum + entry.amount, 0);
  const settledExpense = entries.filter((entry) => entry.kind === "expense" && entry.status === "settled").reduce((sum, entry) => sum + entry.amount, 0);
  const pendingExpense = entries.filter((entry) => entry.kind === "expense" && entry.status === "pending").reduce((sum, entry) => sum + entry.amount, 0);
  const result = revenue + settledIncome - settledExpense;
  const sorted = useMemo(() => [...entries].sort((a, b) => b.dueDate.localeCompare(a.dueDate)), [entries]);

  async function load() {
    if (isDemoMode()) { setRemote(null); return; }
    setLoading(true); setMessage("");
    try { setRemote(await apiJson<FinanceResponse>("/api/financial")); }
    catch (error) { setMessage(formatApiError(error, "Falha ao carregar financeiro.")); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const cents = Math.round(Number(amount.replace(",", ".")) * 100);
    if (!description.trim() || !Number.isFinite(cents) || cents <= 0) { setMessage("Preencha descrição e valor válidos."); return; }
    setWorking("create"); setMessage("");
    try {
      if (isDemoMode()) {
        const selected = categories.find((item)=>item.id===categoryId);
        demoActions.addFinancialEntry({ id: uid("fin"), kind, status: "pending", description: description.trim(), categoryId: selected?.id, categoryName: selected?.name || "Sem categoria", amount: cents, dueDate, recurring: false, createdAt: new Date().toISOString() });
      } else {
        await apiJson("/api/financial", { method: "POST", body: JSON.stringify({ kind, description: description.trim(), categoryId: categoryId || null, amount: cents, dueDate, status: "pending", recurring: false }) });
        await load(); requestOperationalRefresh();
      }
      setCreating(false); setDescription(""); setAmount(""); setMessage("Lançamento registrado no financeiro.");
    } catch (error) { setMessage(formatApiError(error, "Falha ao registrar lançamento.")); }
    finally { setWorking(""); }
  }

  async function settle() {
    if (!settleEntry) return;
    setWorking(settleEntry.id); setMessage("");
    try {
      if (isDemoMode()) demoActions.updateFinancialEntry(settleEntry.id, "settled", paymentMethod);
      else { await apiJson(`/api/financial/${settleEntry.id}`, { method: "PATCH", body: JSON.stringify({ action: "settle", paymentMethod }) }); await load(); requestOperationalRefresh(); }
      setSettleEntry(null); setMessage("Lançamento liquidado e auditado.");
    } catch (error) { setMessage(formatApiError(error, "Falha ao liquidar lançamento.")); }
    finally { setWorking(""); }
  }

  async function cancel(entry: FinancialEntry) {
    const reason = window.prompt("Informe o motivo do cancelamento:");
    if (!reason || reason.trim().length < 2) return;
    setWorking(entry.id); setMessage("");
    try {
      if (isDemoMode()) demoActions.updateFinancialEntry(entry.id, "cancelled");
      else { await apiJson(`/api/financial/${entry.id}`, { method: "PATCH", body: JSON.stringify({ action: "cancel", reason: reason.trim() }) }); await load(); requestOperationalRefresh(); }
      setMessage("Lançamento cancelado com auditoria.");
    } catch (error) { setMessage(formatApiError(error, "Falha ao cancelar lançamento.")); }
    finally { setWorking(""); }
  }

  function exportCsv() {
    const rows = [["Tipo", "Status", "Descrição", "Categoria", "Valor (centavos)", "Vencimento", "Liquidação"], ...sorted.map((entry) => [entry.kind, entry.status, entry.description, entry.categoryName, entry.amount, entry.dueDate, entry.settledAt || ""])];
    const csv = "\ufeff" + rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `financeiro-la-forneria-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click(); URL.revokeObjectURL(url);
  }

  return <>
    <PageHeader title="Financeiro" icon={CircleDollarSign} description="Contas a pagar e receber, liquidação, auditoria e conciliação. Em produção, nenhuma baixa financeira depende de estado local." actions={<><button className="btn-secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={17} className={loading?"animate-spin":""}/>Atualizar</button><button className="btn-secondary" onClick={exportCsv}><Download size={17} />Exportar CSV</button><button className="btn-primary" onClick={() => setCreating(true)}><Plus size={17} />Novo lançamento</button></>} />
    {message&&<p className={`mb-5 rounded-xl p-4 text-sm font-semibold ${/falha|erro|preencha/i.test(message)?"bg-red-50 text-red-700":"bg-emerald-50 text-emerald-800"}`}>{message}</p>}
    <div className="grid gap-4 md:grid-cols-4"><StatCard label="Vendas pagas" value={currency(revenue)} icon={<ArrowUpRight />} /><StatCard label="Receitas financeiras" value={currency(settledIncome)} icon={<Wallet />} /><StatCard label="Despesas liquidadas" value={currency(settledExpense)} icon={<CreditCard />} /><StatCard label="Resultado registrado" value={currency(result)} icon={<CircleDollarSign />} /></div>
    <div className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_.7fr]">
      <section className="surface overflow-hidden"><div className="flex items-center justify-between border-b p-5"><h2 className="font-display text-xl font-bold">Lançamentos</h2><span className="text-xs font-bold text-black/40">{sorted.length} registro(s)</span></div><div className="divide-y divide-black/5">{sorted.map((entry) => <EntryRow key={entry.id} entry={entry} working={working===entry.id} onSettle={()=>setSettleEntry(entry)} onCancel={()=>void cancel(entry)} />)}{!sorted.length && <p className="p-8 text-center text-sm text-black/45">Nenhum lançamento no período.</p>}</div></section>
      <aside className="space-y-4"><div className="surface p-5"><h2 className="font-display text-xl font-bold">Contas pendentes</h2><p className="mt-3 text-3xl font-black text-basso-wine">{currency(pendingExpense)}</p><p className="mt-2 text-sm text-black/50">Despesas ainda não liquidadas.</p></div><div className="rounded-2xl bg-basso-black p-5 text-white"><p className="text-xs uppercase tracking-wide text-basso-goldLight">Conciliação</p><p className="mt-2 text-sm text-white/70">Rede, iFood e 99Food só aparecem como conciliados quando houver dados reais do provedor. O painel não simula taxa nem recebimento.</p></div></aside>
    </div>
    {creating && <div className="fixed inset-0 z-[100] grid place-items-center bg-black/50 p-4"><form onSubmit={submit} className="surface w-full max-w-lg p-6"><div className="flex items-center justify-between"><h2 className="font-display text-2xl font-bold">Novo lançamento</h2><button type="button" onClick={() => setCreating(false)}><X /></button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><label><span className="label">Tipo</span><select className="input" value={kind} onChange={(event) => setKind(event.target.value as "income" | "expense")}><option value="income">Receita</option><option value="expense">Despesa</option></select></label><label><span className="label">Categoria</span><select className="input" value={categoryId} onChange={(event)=>setCategoryId(event.target.value)}>{kindCategories.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="sm:col-span-2"><span className="label">Descrição</span><input className="input" value={description} onChange={e => setDescription(e.target.value)} maxLength={200} /></label><label><span className="label">Valor</span><input className="input" value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="0,00" /></label><label><span className="label">Vencimento</span><input className="input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></label></div><button type="submit" className="btn-primary mt-5 w-full" disabled={working==="create"}>{working==="create"?<Loader2 className="animate-spin" size={17}/>:null}Registrar lançamento</button></form></div>}
    {settleEntry&&<div className="fixed inset-0 z-[100] grid place-items-center bg-black/50 p-4"><section className="surface w-full max-w-md p-6"><div className="flex justify-between gap-3"><div><p className="label">Liquidar lançamento</p><h2 className="font-display text-xl font-bold">{settleEntry.description}</h2><p className="mt-2 text-2xl font-black text-basso-wine">{currency(settleEntry.amount)}</p></div><button className="btn-ghost" onClick={()=>setSettleEntry(null)}><X/></button></div><label className="mt-5 block"><span className="label">Forma de pagamento</span><select className="input" value={paymentMethod} onChange={(event)=>setPaymentMethod(event.target.value as PaymentMethod)}><option value="pix">Pix</option><option value="cash">Dinheiro</option><option value="debit">Débito</option><option value="credit">Crédito</option><option value="meal_voucher">Vale-refeição</option><option value="food_voucher">Vale-alimentação</option></select></label><button className="btn-primary mt-5 w-full" onClick={()=>void settle()} disabled={working===settleEntry.id}>{working===settleEntry.id?<Loader2 className="animate-spin" size={17}/>:<CreditCard size={17}/>}Confirmar liquidação</button></section></div>}
  </>;
}
function EntryRow({entry,working,onSettle,onCancel}:{entry:FinancialEntry;working:boolean;onSettle:()=>void;onCancel:()=>void}){const incoming=entry.kind==="income";return <div className="flex flex-wrap items-center gap-4 p-4"><span className={`grid h-10 w-10 place-items-center rounded-xl ${incoming?"bg-emerald-50 text-emerald-700":"bg-red-50 text-red-700"}`}>{incoming?<ArrowUpRight/>:<ArrowDownRight/>}</span><div className="min-w-0 flex-1"><strong className="text-sm">{entry.description}</strong><p className="text-xs text-black/40">{entry.categoryName} • venc. {entry.dueDate}{entry.settledAt?` • liquidado ${shortDateTime(entry.settledAt)}`:""}</p></div><div className="text-right"><strong className={incoming?"text-emerald-700":"text-red-700"}>{incoming?"+":"−"} {currency(entry.amount)}</strong><p className={`text-[10px] font-black uppercase ${entry.status==="settled"?"text-emerald-700":entry.status==="cancelled"?"text-red-600":"text-amber-700"}`}>{entry.status==="settled"?"Liquidado":entry.status==="cancelled"?"Cancelado":"Pendente"}</p></div>{entry.status==="pending"&&<div className="flex gap-2"><button className="btn-secondary min-h-9 px-3 py-1 text-xs" disabled={working} onClick={onSettle}>{working?<Loader2 size={14} className="animate-spin"/>:null}Liquidar</button><button className="btn-ghost min-h-9 px-3 py-1 text-xs text-red-700" disabled={working} onClick={onCancel}>Cancelar</button></div>}</div>}
