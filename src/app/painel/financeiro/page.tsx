"use client";
import { FormEvent, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, CircleDollarSign, CreditCard, Download, Plus, Wallet, X } from "lucide-react";
import { PageHeader } from "@/components/internal/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { demoActions, useDemoState } from "@/lib/demo-store";
import { currency, shortDateTime, uid } from "@/lib/utils";
import type { FinancialEntry, PaymentMethod } from "@/types";

const categories = { income: ["Vendas", "Marketplaces", "Receitas diversas"], expense: ["Insumos", "Equipe", "Taxas", "Operação", "Impostos"] } as const;
export default function FinancePage() {
  const orders = useDemoState(s => s.orders);
  const entries = useDemoState(s => s.financialEntries);
  const [creating, setCreating] = useState(false);
  const [kind, setKind] = useState<"income" | "expense">("expense");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Operação");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [message, setMessage] = useState("");
  const revenue = orders.filter(o => o.paymentStatus === "paid" && o.status !== "cancelled").reduce((sum, order) => sum + order.total, 0);
  const settledIncome = entries.filter(e => e.kind === "income" && e.status === "settled").reduce((sum, entry) => sum + entry.amount, 0);
  const settledExpense = entries.filter(e => e.kind === "expense" && e.status === "settled").reduce((sum, entry) => sum + entry.amount, 0);
  const pendingExpense = entries.filter(e => e.kind === "expense" && e.status === "pending").reduce((sum, entry) => sum + entry.amount, 0);
  const result = revenue + settledIncome - settledExpense;
  const sorted = useMemo(() => [...entries].sort((a, b) => b.dueDate.localeCompare(a.dueDate)), [entries]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const cents = Math.round(Number(amount.replace(",", ".")) * 100);
    if (!description.trim() || !Number.isFinite(cents) || cents <= 0) { setMessage("Preencha descrição e valor válidos."); return; }
    const entry: FinancialEntry = { id: uid("fin"), kind, status: "pending", description: description.trim(), categoryName: category, amount: cents, dueDate, recurring: false, createdAt: new Date().toISOString() };
    demoActions.addFinancialEntry(entry);
    setCreating(false); setDescription(""); setAmount(""); setMessage("Lançamento registrado.");
  }
  function exportCsv() {
    const rows = [["Tipo", "Status", "Descrição", "Categoria", "Valor (centavos)", "Vencimento", "Liquidação"], ...sorted.map(entry => [entry.kind, entry.status, entry.description, entry.categoryName, entry.amount, entry.dueDate, entry.settledAt || ""])];
    const csv = "\ufeff" + rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const a = document.createElement("a"); a.href = url; a.download = `financeiro-la-forneria-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  }
  return <>
    <PageHeader title="Financeiro" icon={CircleDollarSign} description="Fluxo de caixa, contas a pagar e receber, taxas, conciliação e fechamentos diário e mensal." actions={<><button className="btn-secondary" onClick={exportCsv}><Download size={17} />Exportar Excel/CSV</button><button className="btn-secondary" onClick={() => window.print()}><Download size={17} />Salvar em PDF</button><button className="btn-primary" onClick={() => setCreating(true)}><Plus size={17} />Novo lançamento</button></>} />
    <div className="grid gap-4 md:grid-cols-4"><StatCard label="Vendas pagas" value={currency(revenue)} icon={<ArrowUpRight />} /><StatCard label="Receitas financeiras" value={currency(settledIncome)} icon={<Wallet />} /><StatCard label="Despesas liquidadas" value={currency(settledExpense)} icon={<CreditCard />} /><StatCard label="Resultado registrado" value={currency(result)} icon={<CircleDollarSign />} /></div>
    <div className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_.7fr]">
      <section className="surface overflow-hidden"><div className="flex items-center justify-between border-b p-5"><h2 className="font-display text-xl font-bold">Lançamentos</h2><span className="text-xs font-bold text-black/40">{sorted.length} registro(s)</span></div><div className="divide-y divide-black/5">{sorted.map(entry => <EntryRow key={entry.id} entry={entry} />)}{!sorted.length && <p className="p-8 text-center text-sm text-black/45">Nenhum lançamento no período.</p>}</div></section>
      <aside className="space-y-4"><div className="surface p-5"><h2 className="font-display text-xl font-bold">Contas pendentes</h2><p className="mt-3 text-3xl font-black text-basso-wine">{currency(pendingExpense)}</p><p className="mt-2 text-sm text-black/50">Despesas ainda não liquidadas.</p></div><div className="surface p-5"><h2 className="font-display text-xl font-bold">Conciliação por canal</h2><div className="mt-4 space-y-2"><Status label="Pix" ok /><Status label="Dinheiro" ok /><Status label="Rede" /><Status label="iFood" /><Status label="99Food" /></div></div><div className="rounded-2xl bg-basso-black p-5 text-white"><p className="text-xs uppercase tracking-wide text-basso-goldLight">Implantação</p><p className="mt-2 text-sm text-white/70">Taxas reais de cartão e marketplaces são parâmetros configuráveis e não foram inventadas.</p></div>{message && <p className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{message}</p>}</aside>
    </div>
    {creating && <div className="fixed inset-0 z-[100] grid place-items-center bg-black/50 p-4"><form onSubmit={submit} className="surface w-full max-w-lg p-6"><div className="flex items-center justify-between"><h2 className="font-display text-2xl font-bold">Novo lançamento</h2><button type="button" onClick={() => setCreating(false)}><X /></button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><label><span className="label">Tipo</span><select className="input" value={kind} onChange={e => { const next = e.target.value as "income" | "expense"; setKind(next); setCategory(categories[next][0]); }}><option value="income">Receita</option><option value="expense">Despesa</option></select></label><label><span className="label">Categoria</span><select className="input" value={category} onChange={e => setCategory(e.target.value)}>{categories[kind].map(item => <option key={item}>{item}</option>)}</select></label><label className="sm:col-span-2"><span className="label">Descrição</span><input className="input" value={description} onChange={e => setDescription(e.target.value)} maxLength={200} /></label><label><span className="label">Valor</span><input className="input" value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="0,00" /></label><label><span className="label">Vencimento</span><input className="input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></label></div><button className="btn-primary mt-5 w-full">Registrar lançamento</button></form></div>}
  </>;
}
function EntryRow({ entry }: { entry: FinancialEntry }) { const incoming = entry.kind === "income"; function settle() { demoActions.updateFinancialEntry(entry.id, "settled", "pix" as PaymentMethod); } return <div className="flex flex-wrap items-center gap-4 p-4"><span className={`grid h-10 w-10 place-items-center rounded-xl ${incoming ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{incoming ? <ArrowUpRight /> : <ArrowDownRight />}</span><div className="min-w-0 flex-1"><strong className="text-sm">{entry.description}</strong><p className="text-xs text-black/40">{entry.categoryName} • venc. {entry.dueDate}{entry.settledAt ? ` • liquidado ${shortDateTime(entry.settledAt)}` : ""}</p></div><div className="text-right"><strong className={incoming ? "text-emerald-700" : "text-red-700"}>{incoming ? "+" : "−"} {currency(entry.amount)}</strong><p className={`text-[10px] font-black uppercase ${entry.status === "settled" ? "text-emerald-700" : entry.status === "cancelled" ? "text-red-600" : "text-amber-700"}`}>{entry.status === "settled" ? "Liquidado" : entry.status === "cancelled" ? "Cancelado" : "Pendente"}</p></div>{entry.status === "pending" && <button className="btn-secondary min-h-9 px-3 py-1 text-xs" onClick={settle}>Liquidar</button>}</div>; }
function Status({ label, ok = false }: { label: string; ok?: boolean }) { return <div className="flex justify-between rounded-xl bg-basso-paper px-3 py-2 text-sm"><span>{label}</span><strong className={ok ? "text-emerald-700" : "text-amber-700"}>{ok ? "Conciliado" : "Aguardando credenciais"}</strong></div>; }
