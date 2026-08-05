"use client";
import { FormEvent, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Calculator, LockKeyhole, Receipt, X } from "lucide-react";
import { PageHeader } from "@/components/internal/PageHeader";
import { demoActions, useDemoState } from "@/lib/demo-store";
import { currency, shortDateTime } from "@/lib/utils";
import type { CashMovement } from "@/types";

type MovementKind = "supply" | "withdrawal" | "adjustment";

export default function CashPage() {
  const state = useDemoState(s => ({ open: s.cashOpen, initial: s.cashInitial, openedAt: s.cashOpenedAt, orders: s.orders, movements: s.cashMovements }));
  const [initial, setInitial] = useState("150");
  const [declared, setDeclared] = useState("");
  const [notes, setNotes] = useState("");
  const [movement, setMovement] = useState<MovementKind | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const paidCashOrders = state.orders.filter(o => o.paymentStatus === "paid" && o.paymentMethod === "cash").reduce((sum, order) => sum + order.total, 0);
  const recordedCashSales = state.movements.filter(item => item.kind === "sale").reduce((sum, item) => sum + item.amount, 0);
  const manualMovementTotal = state.movements.filter(item => item.kind !== "sale").reduce((sum, item) => sum + item.amount, 0);
  const cashSales = recordedCashSales > 0 ? recordedCashSales : paidCashOrders;
  const expected = state.initial + cashSales + manualMovementTotal;
  const declaredCents = Math.round(Number(declared.replace(",", ".")) * 100);
  const difference = Number.isFinite(declaredCents) && declared ? declaredCents - expected : 0;

  const sortedMovements = useMemo(() => [...state.movements].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [state.movements]);

  function submitMovement(event: FormEvent) {
    event.preventDefault();
    if (!movement) return;
    const cents = Math.round(Number(amount.replace(",", ".")) * 100);
    if (!Number.isFinite(cents) || cents <= 0 || reason.trim().length < 2) {
      setMessage("Informe valor e motivo válidos.");
      return;
    }
    demoActions.recordCashMovement(movement, cents, reason.trim());
    setMessage(`${movement === "withdrawal" ? "Sangria" : movement === "supply" ? "Suprimento" : "Ajuste"} registrado.`);
    setMovement(null); setAmount(""); setReason("");
  }

  function toggle() {
    if (state.open) {
      if (!declared || !Number.isFinite(declaredCents) || declaredCents < 0) { setMessage("Informe o valor contado para fechar o caixa."); return; }
      demoActions.toggleCash(false, 0, declaredCents, notes);
      setMessage(`Caixa fechado. Diferença: ${currency(difference)}.`);
      setDeclared(""); setNotes("");
    } else {
      const cents = Math.round(Number(initial.replace(",", ".")) * 100);
      if (!Number.isFinite(cents) || cents < 0) { setMessage("Informe um fundo inicial válido."); return; }
      demoActions.toggleCash(true, cents);
      setMessage("Caixa aberto com auditoria do operador.");
    }
  }

  return <>
    <PageHeader title="Caixa" icon={Receipt} description="Abertura, suprimento, sangria, conferência, fechamento diário e histórico com usuário responsável." />
    <div className="grid gap-6 xl:grid-cols-[1fr_390px]">
      <section className="space-y-4">
        <div className={`surface p-6 ${state.open ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
          <div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-black/40">Situação atual</p><h2 className="mt-1 font-display text-3xl font-bold">Caixa {state.open ? "aberto" : "fechado"}</h2>{state.openedAt && <p className="mt-2 text-sm text-black/50">Aberto em {shortDateTime(state.openedAt)}</p>}</div><span className={`h-4 w-4 rounded-full ${state.open ? "bg-emerald-500" : "bg-red-500"}`} /></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Kpi label="Fundo inicial" value={currency(state.initial)} /><Kpi label="Vendas em dinheiro" value={currency(cashSales)} /><Kpi label="Movimentações manuais" value={currency(manualMovementTotal)} /><Kpi label="Saldo teórico" value={currency(expected)} /></div>
        <div className="surface p-5"><h2 className="font-display text-xl font-bold">Movimentações rápidas</h2><div className="mt-4 grid gap-3 sm:grid-cols-3"><button disabled={!state.open} className="btn-secondary" onClick={() => setMovement("supply")}><ArrowDownToLine size={17} />Registrar suprimento</button><button disabled={!state.open} className="btn-secondary" onClick={() => setMovement("withdrawal")}><ArrowUpFromLine size={17} />Registrar sangria</button><button disabled={!state.open} className="btn-secondary" onClick={() => setMovement("adjustment")}><Calculator size={17} />Ajuste autorizado</button></div></div>
        <div className="surface overflow-hidden"><div className="border-b border-black/5 p-5"><h2 className="font-display text-xl font-bold">Histórico da sessão</h2></div><div className="divide-y divide-black/5">{sortedMovements.map(item => <MovementRow key={item.id} item={item} />)}{!sortedMovements.length && <p className="p-6 text-center text-sm text-black/45">Nenhuma movimentação manual nesta sessão.</p>}</div></div>
      </section>
      <aside className="surface self-start p-5"><h2 className="font-display text-xl font-bold">{state.open ? "Fechar caixa" : "Abrir caixa"}</h2>{state.open ? <><label className="mt-4 block"><span className="label">Valor contado</span><input className="input" value={declared} onChange={e => setDeclared(e.target.value)} inputMode="decimal" placeholder="0,00" /></label><label className="mt-4 block"><span className="label">Observação</span><textarea className="textarea min-h-24" maxLength={500} value={notes} onChange={e => setNotes(e.target.value)} /></label>{declared && <div className={`mt-4 rounded-xl p-3 text-sm font-bold ${difference === 0 ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>Diferença prevista: {currency(difference)}</div>}</> : <label className="mt-4 block"><span className="label">Valor inicial</span><input className="input" value={initial} onChange={e => setInitial(e.target.value)} inputMode="decimal" /></label>}<p className="mt-4 text-sm text-black/50">A ação registra data, operador, dispositivo, valores declarados e divergências.</p><button className={`mt-5 w-full ${state.open ? "btn-secondary" : "btn-primary"}`} onClick={toggle}><LockKeyhole size={17} />{state.open ? "Conferir e fechar" : "Confirmar abertura"}</button>{message && <p className="mt-4 rounded-xl bg-blue-50 p-3 text-sm font-semibold text-blue-800">{message}</p>}</aside>
    </div>
    {movement && <div className="fixed inset-0 z-[100] grid place-items-center bg-black/50 p-4"><form onSubmit={submitMovement} className="surface w-full max-w-md p-6"><div className="flex items-center justify-between"><h2 className="font-display text-2xl font-bold">{movement === "withdrawal" ? "Nova sangria" : movement === "supply" ? "Novo suprimento" : "Ajuste autorizado"}</h2><button type="button" onClick={() => setMovement(null)}><X /></button></div><label className="mt-5 block"><span className="label">Valor</span><input autoFocus className="input" value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="0,00" /></label><label className="mt-4 block"><span className="label">Motivo obrigatório</span><textarea className="textarea" maxLength={300} value={reason} onChange={e => setReason(e.target.value)} /></label><button className="btn-primary mt-5 w-full">Registrar com auditoria</button></form></div>}
  </>;
}
function Kpi({ label, value }: { label: string; value: string }) { return <div className="surface p-5"><p className="text-xs font-bold uppercase text-black/40">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></div>; }
function MovementRow({ item }: { item: CashMovement }) { const positive = item.amount >= 0; return <div className="flex items-center gap-4 p-4"><span className={`grid h-10 w-10 place-items-center rounded-xl ${positive ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{positive ? <ArrowDownToLine size={18} /> : <ArrowUpFromLine size={18} />}</span><div className="min-w-0 flex-1"><strong className="text-sm">{item.reason}</strong><p className="text-xs text-black/40">{item.actor || "Operação"} • {shortDateTime(item.createdAt)}</p></div><strong className={positive ? "text-emerald-700" : "text-red-700"}>{positive ? "+" : "−"} {currency(Math.abs(item.amount))}</strong></div>; }
