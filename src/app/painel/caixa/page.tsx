"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Calculator, Loader2, LockKeyhole, Receipt, RefreshCw, X } from "lucide-react";
import { PageHeader } from "@/components/internal/PageHeader";
import { demoActions } from "@/lib/demo-store";
import { useStableDemoState } from "@/lib/stable-store";
import { apiJson, formatApiError, requestOperationalRefresh } from "@/lib/client/api";
import { currency, isDemoMode, shortDateTime } from "@/lib/utils";
import type { CashMovement } from "@/types";

type MovementKind = "supply" | "withdrawal" | "adjustment";
interface CashApiResponse {
  open: boolean;
  session: null | { id: string; initial_cents: number; opened_at: string; status: string; declared_cents?: number | null; expected_cents?: number | null; difference_cents?: number | null };
  movements: Array<{ id: string; kind: CashMovement["kind"]; amount_cents: number; reason: string; created_at: string; created_by?: string }>;
  expectedCents: number;
}

function normalizeCashResponse(value: unknown): CashApiResponse {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const sessionRaw = raw.session && typeof raw.session === "object" ? raw.session as Record<string, unknown> : null;
  const movements = Array.isArray(raw.movements) ? raw.movements.map((entry, index) => {
    const movement = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    const amount = Number(movement.amount_cents || 0);
    return {
      id: typeof movement.id === "string" ? movement.id : `movement-${index}`,
      kind: (["sale", "supply", "withdrawal", "refund", "adjustment"].includes(String(movement.kind)) ? String(movement.kind) : "adjustment") as CashMovement["kind"],
      amount_cents: Number.isFinite(amount) ? Math.trunc(amount) : 0,
      reason: typeof movement.reason === "string" ? movement.reason : "Movimentação",
      created_at: typeof movement.created_at === "string" ? movement.created_at : new Date().toISOString(),
      created_by: typeof movement.created_by === "string" ? movement.created_by : undefined,
    };
  }) : [];
  const session = sessionRaw ? {
    id: String(sessionRaw.id || ""),
    initial_cents: Number(sessionRaw.initial_cents || 0),
    opened_at: String(sessionRaw.opened_at || ""),
    status: String(sessionRaw.status || "open"),
    declared_cents: sessionRaw.declared_cents == null ? null : Number(sessionRaw.declared_cents),
    expected_cents: sessionRaw.expected_cents == null ? null : Number(sessionRaw.expected_cents),
    difference_cents: sessionRaw.difference_cents == null ? null : Number(sessionRaw.difference_cents),
  } : null;
  const expected = Number(raw.expectedCents);
  const fallbackExpected = (session?.initial_cents || 0) + movements.reduce((sum, movement) => sum + movement.amount_cents, 0);
  return { open: Boolean(raw.open && session), session, movements, expectedCents: Number.isFinite(expected) ? Math.trunc(expected) : fallbackExpected };
}

function centsFromInput(value: string) {
  const number = Number(value.trim().replace(/\./g, "").replace(",", "."));
  return Number.isFinite(number) ? Math.round(number * 100) : NaN;
}

export default function CashPage() {
  const store = useStableDemoState((state) => state);
  const snapshot = useMemo(() => ({ open: store.cashOpen, initial: store.cashInitial, openedAt: store.cashOpenedAt, movements: store.cashMovements }), [store.cashOpen, store.cashInitial, store.cashOpenedAt, store.cashMovements]);
  const [remote, setRemote] = useState<CashApiResponse | null>(null);
  const [initial, setInitial] = useState("150,00");
  const [declared, setDeclared] = useState("");
  const [notes, setNotes] = useState("");
  const [movement, setMovement] = useState<MovementKind | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState("");

  const state = useMemo(() => {
    if (!remote) return snapshot;
    return {
      open: remote.open,
      initial: remote.session?.initial_cents || 0,
      openedAt: remote.session?.opened_at || undefined,
      movements: remote.movements.map((item) => ({ id: item.id, kind: item.kind, amount: item.amount_cents, reason: item.reason, createdAt: item.created_at, actor: "Equipe" } satisfies CashMovement)),
    };
  }, [remote, snapshot]);

  const expected = remote?.expectedCents ?? (state.initial + state.movements.reduce((sum, item) => sum + Number(item.amount || 0), 0));
  const declaredCents = centsFromInput(declared);
  const difference = Number.isFinite(declaredCents) && declared ? declaredCents - expected : 0;
  const sortedMovements = useMemo(() => [...state.movements].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))), [state.movements]);
  const totals = useMemo(() => ({
    sales: state.movements.filter((item) => item.kind === "sale").reduce((sum, item) => sum + Math.max(0, item.amount), 0),
    supplies: state.movements.filter((item) => item.kind === "supply").reduce((sum, item) => sum + Math.max(0, item.amount), 0),
    withdrawals: state.movements.filter((item) => item.kind === "withdrawal").reduce((sum, item) => sum + Math.abs(item.amount), 0),
  }), [state.movements]);

  async function load() {
    if (isDemoMode()) { setRemote(null); setLoadError(""); return; }
    setLoading(true); setLoadError("");
    try {
      const body = await apiJson<unknown>("/api/cash");
      setRemote(normalizeCashResponse(body));
    } catch (error) {
      setLoadError(formatApiError(error, "Falha ao consultar caixa."));
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  async function submitMovement(event: FormEvent) {
    event.preventDefault();
    if (!movement) return;
    const cents = centsFromInput(amount);
    if (!Number.isFinite(cents) || cents <= 0 || reason.trim().length < 2) { setMessage("Informe valor e motivo válidos."); return; }
    if (movement === "withdrawal" && cents > expected) { setMessage("A sangria não pode exceder o dinheiro teórico disponível no caixa."); return; }
    setWorking("movement"); setMessage("");
    try {
      if (isDemoMode()) demoActions.recordCashMovement(movement, cents, reason.trim());
      else await apiJson("/api/cash", { method: "POST", body: JSON.stringify({ action: "movement", kind: movement, amount: cents, reason: reason.trim() }) });
      const label = movement === "withdrawal" ? "Sangria" : movement === "supply" ? "Suprimento" : "Ajuste";
      setMovement(null); setAmount(""); setReason("");
      if (!isDemoMode()) { await load(); requestOperationalRefresh(); }
      setMessage(`${label} registrado com auditoria.`);
    } catch (error) { setMessage(formatApiError(error, "Falha ao registrar movimentação.")); }
    finally { setWorking(""); }
  }

  async function toggle() {
    setMessage(""); setWorking("session");
    try {
      if (state.open) {
        if (!declared || !Number.isFinite(declaredCents) || declaredCents < 0) throw new Error("Informe o valor contado para fechar o caixa.");
        if (Math.abs(difference) >= 100 && notes.trim().length < 2) throw new Error("Informe uma observação para justificar a diferença do caixa.");
        if (isDemoMode()) demoActions.toggleCash(false, 0, declaredCents, notes);
        else await apiJson("/api/cash", { method: "POST", body: JSON.stringify({ action: "close", declared: declaredCents, notes: notes.trim() || undefined }) });
        setDeclared(""); setNotes("");
        setMessage(`Caixa fechado. Diferença registrada: ${currency(difference)}.`);
      } else {
        const cents = centsFromInput(initial);
        if (!Number.isFinite(cents) || cents < 0) throw new Error("Informe um fundo inicial válido.");
        if (isDemoMode()) demoActions.toggleCash(true, cents);
        else await apiJson("/api/cash", { method: "POST", body: JSON.stringify({ action: "open", initial: cents }) });
        setMessage("Caixa aberto com registro do operador.");
      }
      if (!isDemoMode()) { await load(); requestOperationalRefresh(); }
    } catch (error) { setMessage(formatApiError(error, "Falha no caixa.")); }
    finally { setWorking(""); }
  }

  return <>
    <PageHeader title="Caixa" icon={Receipt} description="Abertura, suprimento, sangria, vendas em dinheiro, conferência e fechamento confirmados pelo servidor e auditados." actions={<button className="btn-secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={17} className={loading ? "animate-spin" : ""} />Atualizar</button>} />

    {loadError && <div className="mb-4 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertTriangle className="mt-0.5 shrink-0" size={18} /><div><strong>Não foi possível atualizar o Caixa.</strong><p className="mt-1">{loadError} Os últimos dados válidos continuam visíveis; nenhuma operação deve ser presumida como concluída.</p></div></div>}
    {message && <p className={`mb-4 rounded-xl p-3 text-sm font-semibold ${/falha|erro|informe|não pode/i.test(message) ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-800"}`}>{message}</p>}

    <div className="grid gap-6 xl:grid-cols-[1fr_390px]">
      <section className="space-y-4">
        <div className={`surface p-6 ${state.open ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-black/40">Situação atual</p><h2 className="mt-1 font-display text-3xl font-bold">Caixa {state.open ? "aberto" : "fechado"}</h2>{state.openedAt && <p className="mt-2 text-sm text-black/50">Aberto em {shortDateTime(state.openedAt)}</p>}</div><span className={`h-4 w-4 rounded-full ${state.open ? "bg-emerald-500" : "bg-red-500"}`} /></div></div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Kpi label="Fundo inicial" value={currency(state.initial)} /><Kpi label="Vendas em dinheiro" value={currency(totals.sales)} /><Kpi label="Sangrias" value={currency(totals.withdrawals)} /><Kpi label="Saldo teórico" value={currency(expected)} /></div>
        <div className="surface p-5"><h2 className="font-display text-xl font-bold">Movimentações rápidas</h2><p className="mt-1 text-sm text-black/45">Toda sangria, suprimento ou ajuste exige caixa aberto, motivo e resposta do servidor.</p><div className="mt-4 grid gap-3 sm:grid-cols-3"><button disabled={!state.open || Boolean(working) || Boolean(loadError)} className="btn-secondary" onClick={() => setMovement("supply")}><ArrowDownToLine size={17} />Registrar suprimento</button><button disabled={!state.open || Boolean(working) || Boolean(loadError)} className="btn-secondary" onClick={() => setMovement("withdrawal")}><ArrowUpFromLine size={17} />Registrar sangria</button><button disabled={!state.open || Boolean(working) || Boolean(loadError)} className="btn-secondary" onClick={() => setMovement("adjustment")}><Calculator size={17} />Ajuste autorizado</button></div></div>
        <div className="surface overflow-hidden"><div className="border-b border-black/5 p-5"><h2 className="font-display text-xl font-bold">Histórico da sessão</h2></div><div className="divide-y divide-black/5">{sortedMovements.map((item) => <MovementRow key={item.id} item={item} />)}{!sortedMovements.length && <p className="p-6 text-center text-sm text-black/45">Nenhuma movimentação nesta sessão.</p>}</div></div>
      </section>

      <aside className="surface self-start p-5"><h2 className="font-display text-xl font-bold">{state.open ? "Fechar caixa" : "Abrir caixa"}</h2>{state.open ? <><label className="mt-4 block"><span className="label">Valor contado</span><input className="input text-base" value={declared} onChange={(event) => setDeclared(event.target.value)} inputMode="decimal" placeholder="0,00" /></label><label className="mt-4 block"><span className="label">Observação</span><textarea className="textarea min-h-24 text-base" maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Obrigatória quando houver diferença relevante" /></label>{declared && Number.isFinite(declaredCents) && <div className={`mt-4 rounded-xl p-3 text-sm font-bold ${difference === 0 ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>Diferença prevista: {currency(difference)}</div>}</> : <label className="mt-4 block"><span className="label">Valor inicial</span><input className="input text-base" value={initial} onChange={(event) => setInitial(event.target.value)} inputMode="decimal" /></label>}<button className={`mt-5 w-full ${state.open ? "btn-secondary" : "btn-primary"}`} disabled={Boolean(working) || Boolean(loadError)} onClick={() => void toggle()}>{working === "session" ? <Loader2 size={17} className="animate-spin" /> : <LockKeyhole size={17} />} {state.open ? "Conferir e fechar" : "Confirmar abertura"}</button></aside>
    </div>

    {movement && <div className="fixed inset-0 z-[100] grid place-items-center bg-black/50 p-4"><form onSubmit={submitMovement} className="surface w-full max-w-md p-6"><div className="flex items-center justify-between"><h2 className="font-display text-2xl font-bold">{movement === "withdrawal" ? "Nova sangria" : movement === "supply" ? "Novo suprimento" : "Ajuste autorizado"}</h2><button type="button" onClick={() => setMovement(null)} aria-label="Fechar"><X /></button></div><label className="mt-5 block"><span className="label">Valor</span><input autoFocus className="input text-base" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0,00" /></label><label className="mt-4 block"><span className="label">Motivo obrigatório</span><textarea className="textarea text-base" maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} /></label><button type="submit" className="btn-primary mt-5 w-full" disabled={working === "movement"}>{working === "movement" ? <Loader2 size={17} className="animate-spin" /> : null}Registrar com auditoria</button></form></div>}
  </>;
}

function Kpi({ label, value }: { label: string; value: string }) { return <div className="surface p-5"><p className="text-xs font-bold uppercase text-black/40">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></div>; }
function MovementRow({ item }: { item: CashMovement }) {
  const positive = item.amount >= 0;
  const label = item.kind === "sale" ? "Venda em dinheiro" : item.kind === "withdrawal" ? "Sangria" : item.kind === "supply" ? "Suprimento" : item.kind === "refund" ? "Estorno" : "Ajuste";
  return <div className="flex items-center gap-4 p-4"><span className={`grid h-10 w-10 place-items-center rounded-xl ${positive ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{positive ? <ArrowDownToLine size={18} /> : <ArrowUpFromLine size={18} />}</span><div className="min-w-0 flex-1"><strong className="text-sm">{label} • {item.reason}</strong><p className="text-xs text-black/40">{item.actor || "Operação"} • {shortDateTime(item.createdAt)}</p></div><strong className={positive ? "text-emerald-700" : "text-red-700"}>{positive ? "+" : "−"} {currency(Math.abs(item.amount))}</strong></div>;
}
