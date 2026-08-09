"use client";

import { FormEvent, useEffect, useState } from "react";
import { Boxes, Camera, Database, Flag, Loader2, RefreshCw, RotateCcw, Save, ServerCog } from "lucide-react";
import { PageHeader } from "@/components/internal/PageHeader";
import { shortDateTime } from "@/lib/utils";
import type { FeatureFlagRecord, SystemAbout } from "@/types";

type SnapshotRow = { id: string; name: string; scope: string; created_by_label?: string; created_at: string; restored_at?: string };

export default function SystemPage() {
  const [about, setAbout] = useState<SystemAbout | null>(null);
  const [flags, setFlags] = useState<FeatureFlagRecord[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
  const [snapshotName, setSnapshotName] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true); setMessage("");
    try {
      const [a, f, s] = await Promise.all([
        fetch("/api/system/about", { cache: "no-store" }),
        fetch("/api/feature-flags", { cache: "no-store" }),
        fetch("/api/system/snapshots", { cache: "no-store" }),
      ]);
      const [ab, fb, sb] = await Promise.all([a.json(), f.json(), s.json()]);
      if (!a.ok) throw new Error(ab.error || "Falha ao consultar instalação.");
      if (!f.ok) throw new Error(fb.error || "Falha ao consultar recursos.");
      if (!s.ok) throw new Error(sb.error || "Falha ao consultar snapshots.");
      setAbout(ab); setFlags(fb.flags || []); setSnapshots(sb.snapshots || []);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Falha ao carregar sistema."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function toggle(flag: FeatureFlagRecord) {
    setWorking(flag.key); setMessage("");
    try {
      const response = await fetch("/api/feature-flags", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: flag.key, enabled: !flag.enabled, config: flag.config }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Falha ao atualizar recurso.");
      setFlags((current) => current.map((item) => item.key === flag.key ? body.flag : item));
      setMessage(`${flag.label}: ${body.flag.enabled ? "ativado" : "desativado"}.`);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Falha ao atualizar recurso."); }
    finally { setWorking(""); }
  }

  async function createSnapshot(event: FormEvent) {
    event.preventDefault(); if (snapshotName.trim().length < 2) return;
    setWorking("snapshot"); setMessage("");
    try {
      const response = await fetch("/api/system/snapshots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: snapshotName.trim() }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "Falha ao criar snapshot.");
      setSnapshotName(""); setMessage("Snapshot das configurações criado."); await load();
    } catch (e) { setMessage(e instanceof Error ? e.message : "Falha ao criar snapshot."); }
    finally { setWorking(""); }
  }

  async function restore(snapshot: SnapshotRow) {
    if (!window.confirm(`Restaurar o snapshot “${snapshot.name}”? Configurações atuais serão substituídas.`)) return;
    setWorking(snapshot.id); setMessage("");
    try {
      const response = await fetch("/api/system/snapshots", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: snapshot.id }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "Falha ao restaurar snapshot.");
      setMessage("Configurações restauradas. Revise loja, canais e integrações antes de continuar."); await load();
    } catch (e) { setMessage(e instanceof Error ? e.message : "Falha ao restaurar snapshot."); }
    finally { setWorking(""); }
  }

  return <>
    <PageHeader title="Sobre esta instalação" icon={ServerCog} description="Versão do PedidoPro, banco instalado, recursos habilitados e snapshots de configuração." actions={<button className="btn-secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={17} className={loading ? "animate-spin" : ""}/>Atualizar</button>} />
    {message && <div className="mb-5 rounded-2xl border bg-white p-4 text-sm font-semibold">{message}</div>}
    {loading && !about ? <div className="surface grid min-h-56 place-items-center"><Loader2 className="animate-spin text-basso-wine"/></div> : about && <>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Info icon={Boxes} label="Aplicação" value={`${about.appName} ${about.version}`}/><Info icon={ServerCog} label="Cliente" value={about.clientName}/><Info icon={Database} label="Banco" value={about.databaseVersion ? `Migration ${String(about.databaseVersion).padStart(3, "0")}` : "Não identificado"}/><Info icon={Flag} label="Ambiente" value={about.environment}/></div>
      <div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
        <section className="surface overflow-hidden"><div className="border-b p-5"><h2 className="font-display text-2xl font-bold">Recursos e feature flags</h2><p className="mt-1 text-sm text-black/45">Integrações externas permanecem desligadas até estarem realmente configuradas.</p></div><div className="divide-y">{flags.map((flag) => <div key={flag.key} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong>{flag.label}</strong>{flag.requiresIntegration && <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-800">Exige integração</span>}</div><p className="mt-1 text-sm text-black/50">{flag.description}</p><p className="mt-1 text-[11px] text-black/35">Atualizado {shortDateTime(flag.updatedAt)}</p></div><button className={`min-h-10 rounded-xl px-4 text-xs font-black ${flag.enabled ? "bg-emerald-600 text-white" : "bg-black/5 text-black/55"}`} onClick={() => void toggle(flag)} disabled={working === flag.key}>{working === flag.key ? <Loader2 size={15} className="mr-2 inline animate-spin"/> : <Save size={15} className="mr-2 inline"/>}{flag.enabled ? "Ativo" : "Desativado"}</button></div>)}</div></section>
        <section className="surface overflow-hidden"><div className="border-b p-5"><h2 className="flex items-center gap-2 font-display text-xl font-bold"><Camera className="text-basso-wine"/>Snapshots</h2><p className="mt-1 text-sm text-black/45">Salve configurações antes de mudanças grandes.</p></div><form onSubmit={createSnapshot} className="border-b p-4"><label><span className="label">Nome do snapshot</span><input className="input" value={snapshotName} onChange={(e) => setSnapshotName(e.target.value)} placeholder="Ex.: Antes do feriado" maxLength={120}/></label><button type="submit" className="btn-primary mt-3 w-full" disabled={working === "snapshot" || snapshotName.trim().length < 2}>{working === "snapshot" ? <Loader2 size={16} className="animate-spin"/> : <Camera size={16}/>}Salvar configuração atual</button></form><div className="max-h-[520px] divide-y overflow-y-auto">{snapshots.map((snapshot) => <div key={snapshot.id} className="p-4"><strong>{snapshot.name}</strong><p className="mt-1 text-xs text-black/40">{snapshot.created_by_label || "Sistema"} • {shortDateTime(snapshot.created_at)}</p>{snapshot.restored_at && <p className="mt-1 text-xs font-semibold text-amber-700">Restaurado {shortDateTime(snapshot.restored_at)}</p>}<button className="btn-ghost mt-2" onClick={() => void restore(snapshot)} disabled={working === snapshot.id}>{working === snapshot.id ? <Loader2 size={15} className="animate-spin"/> : <RotateCcw size={15}/>}Restaurar</button></div>)}{!snapshots.length && <p className="p-6 text-center text-sm text-black/45">Nenhum snapshot criado.</p>}</div></section>
      </div>
    </>}
  </>;
}
function Info({ icon: Icon, label, value }: { icon: typeof Boxes; label: string; value: string }) { return <div className="surface p-4"><Icon className="text-basso-wine" size={20}/><p className="mt-3 text-xs font-black uppercase text-black/40">{label}</p><p className="mt-1 font-display text-xl font-bold">{value}</p></div>; }
