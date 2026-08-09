"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Ban,
  Check,
  CheckCircle2,
  CirclePlay,
  Clock3,
  ListChecks,
  Loader2,
  LockKeyhole,
  RefreshCw,
  RotateCcw,
  SkipForward,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/internal/PageHeader";
import { isDemoMode, shortDateTime, uid } from "@/lib/utils";
import type { ChecklistItemStatus, ChecklistPhase, ChecklistRun, ChecklistRunItem } from "@/types";

const demoTemplates: Record<ChecklistPhase, Array<{ id: string; title: string; description: string; required: boolean }>> = {
  opening: [
    { id: "opening_cash", title: "Confirmar abertura do caixa", description: "Abra o caixa e confira o valor inicial.", required: true },
    { id: "opening_printers", title: "Conferir impressoras", description: "Verifique papel, conexão e fila de impressão.", required: true },
    { id: "opening_network", title: "Conferir internet e sincronização", description: "Confirme Supabase e dispositivos operacionais.", required: true },
    { id: "opening_kitchen", title: "Confirmar cozinha e bar", description: "Setores prontos e responsáveis definidos.", required: true },
    { id: "opening_drivers", title: "Confirmar motoboys disponíveis", description: "Registre a equipe de entrega do turno.", required: false },
    { id: "opening_stock", title: "Conferir bebidas e sobremesas", description: "Revise estoque mínimo e esgotados.", required: true },
    { id: "opening_payments", title: "Conferir formas de pagamento", description: "Pix manual, dinheiro, cartões e vales.", required: true },
    { id: "opening_eta", title: "Definir tempos estimados", description: "Ajuste preparo e entrega para o fluxo previsto.", required: true },
    { id: "opening_menu", title: "Abrir o cardápio", description: "Confirme canais e abra a loja.", required: true },
  ],
  closing: [
    { id: "closing_orders", title: "Concluir pedidos pendentes", description: "Revise pedidos ativos e pagamentos.", required: true },
    { id: "closing_tables", title: "Fechar mesas e comandas", description: "Confirme salão sem pendências.", required: true },
    { id: "closing_deliveries", title: "Concluir entregas", description: "Verifique motoboys e ocorrências.", required: true },
    { id: "closing_print", title: "Resolver falhas de impressão", description: "Reprocesse ou justifique falhas.", required: false },
    { id: "closing_stock", title: "Conferir estoque restrito", description: "Registre perdas e divergências.", required: true },
    { id: "closing_cash", title: "Fechar e conferir o caixa", description: "Conte valores e justifique diferenças.", required: true },
    { id: "closing_report", title: "Gerar resumo do expediente", description: "Revise vendas, pagamentos e despesas.", required: true },
    { id: "closing_store", title: "Fechar a loja", description: "Bloqueie novos pedidos e finalize a operação.", required: true },
  ],
};

function createDemoRun(phase: ChecklistPhase): ChecklistRun {
  return {
    id: uid("checklist"),
    phase,
    businessDate: new Date().toISOString().slice(0, 10),
    status: "in_progress",
    startedAt: new Date().toISOString(),
    startedBy: "Gestor Demo",
    items: demoTemplates[phase].map((template, index) => ({
      id: uid("checkitem"), templateId: template.id, title: template.title, description: template.description,
      required: template.required, sortOrder: (index + 1) * 10, status: "pending",
    })),
  };
}

export default function OperationalRoutinesPage() {
  const [phase, setPhase] = useState<ChecklistPhase>("opening");
  const [runs, setRuns] = useState<ChecklistRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [notes, setNotes] = useState("");
  const [itemNotes, setItemNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("phase");
    if (requested === "opening" || requested === "closing") setPhase(requested);
    load();
  }, []);

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      if (isDemoMode()) {
        setRuns((current) => current.length ? current : []);
        return;
      }
      const response = await fetch("/api/operations/checklists", { cache: "no-store" });
      const body = (await response.json()) as { runs?: ChecklistRun[]; error?: string };
      if (!response.ok) throw new Error(body.error || "Falha ao consultar rotinas.");
      setRuns(body.runs || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao consultar rotinas.");
    } finally {
      setLoading(false);
    }
  }

  const currentRun = useMemo(() => runs.find((run) => run.phase === phase && run.status === "in_progress"), [runs, phase]);
  const history = useMemo(() => runs.filter((run) => run.phase === phase && run.status !== "in_progress").slice(0, 8), [runs, phase]);
  const progress = currentRun ? Math.round((currentRun.items.filter((item) => item.status === "done" || item.status === "skipped").length / Math.max(1, currentRun.items.length)) * 100) : 0;
  const blockedRequired = currentRun?.items.filter((item) => item.required && ["pending", "blocked"].includes(item.status)).length || 0;

  async function start() {
    setWorking(true);
    setMessage("");
    try {
      if (isDemoMode()) {
        setRuns((current) => [createDemoRun(phase), ...current]);
        setMessage("Rotina iniciada em modo demonstração.");
        return;
      }
      const response = await fetch("/api/operations/checklists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start", phase }) });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Falha ao iniciar rotina.");
      await load();
      setMessage("Rotina iniciada e vinculada ao expediente de hoje.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao iniciar rotina.");
    } finally {
      setWorking(false);
    }
  }

  async function updateItem(item: ChecklistRunItem, status: ChecklistItemStatus) {
    const note = itemNotes[item.id]?.trim() || "";
    if (["skipped", "blocked"].includes(status) && !note) {
      setMessage("Informe um motivo antes de pular ou bloquear o item.");
      return;
    }
    setWorking(true);
    setMessage("");
    try {
      if (!isDemoMode()) {
        const response = await fetch(`/api/operations/checklists/items/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, note: note || undefined }) });
        const body = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(body.error || "Falha ao atualizar item.");
      }
      setRuns((current) => current.map((run) => run.id === currentRun?.id ? { ...run, items: run.items.map((currentItem) => currentItem.id === item.id ? { ...currentItem, status, note: note || undefined, actor: status === "done" || status === "skipped" ? "Gestor" : undefined, completedAt: status === "done" || status === "skipped" ? new Date().toISOString() : undefined } : currentItem) } : run));
      setMessage(status === "done" ? "Item concluído." : status === "skipped" ? "Item pulado com justificativa." : status === "blocked" ? "Item marcado como bloqueado." : "Item reaberto.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao atualizar item.");
    } finally {
      setWorking(false);
    }
  }

  async function complete() {
    if (!currentRun) return;
    if (blockedRequired) {
      setMessage(`Ainda existem ${blockedRequired} item(ns) obrigatório(s) pendente(s) ou bloqueado(s).`);
      return;
    }
    setWorking(true);
    setMessage("");
    try {
      if (!isDemoMode()) {
        const response = await fetch("/api/operations/checklists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "complete", runId: currentRun.id, notes: notes.trim() || undefined }) });
        const body = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(body.error || "Falha ao concluir rotina.");
        await load();
      } else {
        setRuns((current) => current.map((run) => run.id === currentRun.id ? { ...run, status: "completed", completedAt: new Date().toISOString(), completedBy: "Gestor Demo", notes, summary: { total: run.items.length, done: run.items.filter((item) => item.status === "done").length, skipped: run.items.filter((item) => item.status === "skipped").length, blocked: run.items.filter((item) => item.status === "blocked").length } } : run));
      }
      setNotes("");
      setMessage(phase === "opening" ? "Abertura concluída. A operação está pronta para iniciar." : "Fechamento concluído e registrado no histórico.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao concluir rotina.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <PageHeader title="Abertura e fechamento" icon={ListChecks} description="Rotinas guiadas para evitar caixa, pedidos, mesas, entregas, impressão ou estoque pendentes no início e no fim do expediente." actions={<button className="btn-secondary" onClick={load} disabled={loading}><RefreshCw size={17} />Atualizar</button>} />
      <div className="mb-5 flex w-fit rounded-2xl border border-black/5 bg-white p-1"><button className={`min-h-10 rounded-xl px-4 text-sm font-bold ${phase === "opening" ? "bg-basso-wine text-white" : "text-black/50"}`} onClick={() => setPhase("opening")}><CirclePlay className="mr-2 inline" size={16} />Abertura</button><button className={`min-h-10 rounded-xl px-4 text-sm font-bold ${phase === "closing" ? "bg-basso-wine text-white" : "text-black/50"}`} onClick={() => setPhase("closing")}><LockKeyhole className="mr-2 inline" size={16} />Fechamento</button></div>
      {message && <p className={`mb-5 rounded-2xl p-4 text-sm font-semibold ${/falha|erro|ainda|informe/i.test(message) ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{message}</p>}
      {loading && <div className="surface grid min-h-60 place-items-center"><Loader2 className="animate-spin text-basso-wine" size={34} /></div>}
      {!loading && !currentRun && <section className="surface grid min-h-72 place-items-center p-8 text-center"><div><span className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-basso-cream text-basso-wine">{phase === "opening" ? <CirclePlay size={30} /> : <LockKeyhole size={30} />}</span><h2 className="mt-5 font-display text-2xl font-bold">Nenhuma rotina em andamento</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-black/50">{phase === "opening" ? "Inicie a conferência antes de liberar o cardápio e receber pedidos do turno." : "Inicie quando o atendimento estiver encerrando para verificar todas as pendências."}</p><button className="btn-primary mt-5" onClick={start} disabled={working}>{working ? <Loader2 className="animate-spin" size={17} /> : <CirclePlay size={17} />}Iniciar rotina de {phase === "opening" ? "abertura" : "fechamento"}</button></div></section>}
      {!loading && currentRun && (
        <div className="grid gap-6 xl:grid-cols-[1.5fr_.7fr]">
          <section className="surface overflow-hidden">
            <div className="border-b border-black/5 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-display text-2xl font-bold">Rotina de {phase === "opening" ? "abertura" : "fechamento"}</h2><p className="mt-1 text-xs text-black/45">Iniciada {shortDateTime(currentRun.startedAt)} por {currentRun.startedBy || "Equipe"}</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{progress}% concluída</span></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-black/5"><div className="h-full rounded-full bg-basso-wine transition-all" style={{ width: `${progress}%` }} /></div></div>
            <div className="divide-y divide-black/5">
              {currentRun.items.map((item, index) => <article key={item.id} className={`p-4 sm:p-5 ${item.status === "blocked" ? "bg-red-50/60" : item.status === "done" ? "bg-emerald-50/40" : ""}`}><div className="flex gap-3"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-black ${item.status === "done" ? "bg-emerald-100 text-emerald-700" : item.status === "skipped" ? "bg-blue-100 text-blue-700" : item.status === "blocked" ? "bg-red-100 text-red-700" : "bg-basso-paper text-black/45"}`}>{item.status === "done" ? <Check size={17} /> : item.status === "skipped" ? <SkipForward size={16} /> : item.status === "blocked" ? <Ban size={16} /> : index + 1}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{item.title}</h3>{item.required && <span className="rounded-full bg-black/[.04] px-2 py-0.5 text-[9px] font-black uppercase text-black/45">Obrigatório</span>}</div><p className="mt-1 text-sm text-black/50">{item.description}</p>{item.note && <p className="mt-2 rounded-xl bg-white p-2 text-xs text-black/60"><strong>Nota:</strong> {item.note}</p>}
              <input className="input mt-3 h-9 text-xs" value={itemNotes[item.id] || ""} onChange={(event) => setItemNotes((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Observação ou motivo para pular/bloquear" />
              <div className="mt-3 flex flex-wrap gap-2"><button className="btn-secondary min-h-8 px-3 text-xs" disabled={working} onClick={() => updateItem(item, "done")}><Check size={14} />Concluir</button><button className="btn-secondary min-h-8 px-3 text-xs" disabled={working} onClick={() => updateItem(item, "skipped")}><SkipForward size={14} />Pular</button><button className="btn-secondary min-h-8 px-3 text-xs" disabled={working} onClick={() => updateItem(item, "blocked")}><Ban size={14} />Bloquear</button>{item.status !== "pending" && <button className="btn-ghost min-h-8 px-3 text-xs" disabled={working} onClick={() => updateItem(item, "pending")}><RotateCcw size={14} />Reabrir</button>}</div></div></div></article>)}
            </div>
          </section>
          <aside className="space-y-5"><section className="surface p-5"><h2 className="font-display text-xl font-bold">Finalizar rotina</h2><div className="mt-4 grid grid-cols-3 gap-2"><Summary label="Concluídos" value={currentRun.items.filter((item) => item.status === "done").length} tone="green" /><Summary label="Pulados" value={currentRun.items.filter((item) => item.status === "skipped").length} tone="blue" /><Summary label="Pendentes" value={currentRun.items.filter((item) => ["pending", "blocked"].includes(item.status)).length} tone="red" /></div><label className="mt-4 block"><span className="label">Resumo do responsável</span><textarea className="textarea" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ocorrências, ressalvas e decisões do turno" /></label><button className="btn-primary mt-4 w-full" disabled={working || blockedRequired > 0} onClick={complete}>{working ? <Loader2 className="animate-spin" size={17} /> : <CheckCircle2 size={17} />}Concluir {phase === "opening" ? "abertura" : "fechamento"}</button>{blockedRequired > 0 && <p className="mt-3 text-xs font-semibold text-red-600">{blockedRequired} item(ns) obrigatório(s) ainda impedem a conclusão.</p>}</section>
          <section className="surface p-5"><h2 className="flex items-center gap-2 font-display text-xl font-bold"><Clock3 className="text-basso-wine" size={20} />Histórico recente</h2><div className="mt-4 space-y-2">{history.map((run) => <div key={run.id} className="rounded-xl bg-basso-paper p-3"><div className="flex items-center justify-between"><strong className="text-sm">{new Date(`${run.businessDate}T12:00:00`).toLocaleDateString("pt-BR")}</strong><span className={`text-[10px] font-black uppercase ${run.status === "completed" ? "text-emerald-700" : "text-red-600"}`}>{run.status === "completed" ? "Concluída" : "Cancelada"}</span></div><p className="mt-1 text-xs text-black/45">{run.completedAt ? shortDateTime(run.completedAt) : shortDateTime(run.startedAt)} • {run.completedBy || run.startedBy || "Equipe"}</p></div>)}{!history.length && <p className="text-sm text-black/45">Nenhuma rotina finalizada nesta base.</p>}</div></section></aside>
        </div>
      )}
    </>
  );
}

function Summary({ label, value, tone }: { label: string; value: number; tone: "green" | "blue" | "red" }) { const classes = tone === "green" ? "bg-emerald-50 text-emerald-700" : tone === "blue" ? "bg-blue-50 text-blue-700" : "bg-red-50 text-red-700"; return <div className={`rounded-xl p-3 text-center ${classes}`}><strong className="block text-xl">{value}</strong><span className="text-[9px] font-black uppercase">{label}</span></div>; }
