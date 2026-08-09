"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BellRing, Bike, Boxes, CircleDollarSign, ClipboardList, CreditCard, Loader2, Printer, RefreshCw, ShieldQuestion, Table2, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/internal/PageHeader";
import { shortDateTime } from "@/lib/utils";
import type { AttentionItem, AttentionKind, AttentionSnapshot } from "@/types";

const kindMeta: Record<AttentionKind, { label: string; icon: LucideIcon }> = {
  order: { label: "Pedidos", icon: ClipboardList },
  payment: { label: "Pagamentos", icon: CreditCard },
  delivery: { label: "Delivery", icon: Bike },
  salon: { label: "Salão", icon: Table2 },
  stock: { label: "Estoque", icon: Boxes },
  print: { label: "Impressão", icon: Printer },
  cash: { label: "Caixa", icon: CircleDollarSign },
  approval: { label: "Aprovações", icon: ShieldQuestion },
  incident: { label: "Ocorrências", icon: AlertTriangle },
  system: { label: "Sistema", icon: Wrench },
};

export default function AttentionPage() {
  const [data, setData] = useState<AttentionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | AttentionKind>("all");

  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/attention", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Falha ao carregar atenção operacional.");
      setData(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar atenção operacional.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); const timer = setInterval(() => void load(), 30_000); return () => clearInterval(timer); }, []);
  const items = useMemo(() => data?.items.filter((item) => filter === "all" || item.kind === filter) || [], [data, filter]);

  return <>
    <PageHeader title="O que precisa da minha atenção" icon={BellRing} description="Uma fila única para atrasos, pagamentos, delivery, estoque, impressão, aprovações e falhas que precisam de ação humana." actions={<button className="btn-secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={17} className={loading ? "animate-spin" : ""}/>Atualizar</button>} />
    {error && <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}
    {loading && !data && <div className="surface grid min-h-64 place-items-center"><Loader2 className="animate-spin text-basso-wine" size={34}/></div>}
    {data && <>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Total" value={data.totals.all}/><Metric label="Crítico" value={data.totals.danger} tone="danger"/><Metric label="Atenção" value={data.totals.warning} tone="warning"/><Metric label="Informativo" value={data.totals.info} tone="info"/></div>
      <div className="mb-5 flex flex-wrap gap-2"><FilterButton active={filter === "all"} onClick={() => setFilter("all")} label={`Tudo (${data.totals.all})`}/>{(Object.keys(kindMeta) as AttentionKind[]).map((kind) => <FilterButton key={kind} active={filter === kind} onClick={() => setFilter(kind)} label={`${kindMeta[kind].label} (${data.groups[kind] || 0})`}/>)}</div>
      <section className="surface overflow-hidden">
        <div className="flex items-center justify-between border-b p-5"><div><h2 className="font-display text-2xl font-bold">Fila operacional</h2><p className="text-sm text-black/45">Ordenada por gravidade e tempo de espera.</p></div><span className="text-xs text-black/40">{shortDateTime(data.generatedAt)}</span></div>
        <div className="divide-y">{items.map((item) => <AttentionRow key={item.id} item={item}/>)}{!items.length && <div className="p-12 text-center"><BellRing className="mx-auto text-emerald-600" size={40}/><h3 className="mt-3 font-display text-xl font-bold">Nada pendente neste filtro</h3><p className="mt-1 text-sm text-black/45">A operação está sem alertas desta categoria.</p></div>}</div>
      </section>
    </>}
  </>;
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const meta = kindMeta[item.kind]; const Icon = meta.icon;
  const tone = item.severity === "danger" ? "bg-red-50 text-red-700" : item.severity === "warning" ? "bg-amber-50 text-amber-800" : "bg-blue-50 text-blue-700";
  return <Link href={item.href} className="flex items-start gap-4 p-4 transition hover:bg-black/[.025] sm:p-5"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${tone}`}><Icon size={20}/></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong>{item.title}</strong><span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${tone}`}>{item.severity === "danger" ? "Crítico" : item.severity === "warning" ? "Atenção" : "Info"}</span></div><p className="mt-1 text-sm text-black/55">{item.detail}</p><p className="mt-2 text-[11px] text-black/35">{meta.label}{typeof item.ageMinutes === "number" ? ` • ${item.ageMinutes} min` : ""}</p></div><span className="mt-2 text-xs font-bold text-basso-wine">Abrir →</span></Link>;
}
function FilterButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) { return <button className={`rounded-full border px-3 py-2 text-xs font-bold ${active ? "border-basso-wine bg-basso-wine text-white" : "border-black/10 bg-white text-black/55"}`} onClick={onClick}>{label}</button>; }
function Metric({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "danger" | "warning" | "info" }) { const cls = tone === "danger" ? "border-red-200 bg-red-50" : tone === "warning" ? "border-amber-200 bg-amber-50" : tone === "info" ? "border-blue-200 bg-blue-50" : ""; return <div className={`surface p-4 ${cls}`}><p className="text-xs font-black uppercase text-black/40">{label}</p><p className="mt-1 text-3xl font-black">{value}</p></div>; }
