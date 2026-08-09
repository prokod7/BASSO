"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  CloudOff,
  DatabaseBackup,
  Download,
  HardDrive,
  History,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Wifi,
  WifiOff,
} from "lucide-react";
import { PageHeader } from "@/components/internal/PageHeader";
import { isDemoMode } from "@/lib/utils";

type BackupHistory = { id: string; generatedAt: string; modules: string[]; size: number; warnings: number };
const moduleOptions = [
  ["settings", "Configurações"], ["catalog", "Cardápio"], ["customers", "Clientes"], ["orders", "Pedidos"],
  ["salon", "Salão"], ["inventory", "Estoque e compras"], ["finance", "Caixa e financeiro"], ["operation", "Rotinas e tarefas"], ["audit", "Auditoria"],
] as const;
const HISTORY_KEY = "lfb-backup-history-v4";

export default function ContinuityPage() {
  const [online, setOnline] = useState(true);
  const [selected, setSelected] = useState<string[]>(moduleOptions.filter(([key]) => key !== "audit").map(([key]) => key));
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<BackupHistory[]>([]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    try { setHistory(JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]") as BackupHistory[]); } catch { setHistory([]); }
    window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);

  const selectedLabel = useMemo(() => moduleOptions.filter(([key]) => selected.includes(key)).map(([,label]) => label).join(", "), [selected]);

  async function exportBackup() {
    if (!selected.length) { setMessage("Selecione ao menos um módulo."); return; }
    setWorking(true); setMessage("");
    try {
      let payload: Record<string, unknown>;
      if (isDemoMode()) {
        payload = { manifest: { product: "PedidoPro - La Forneria Basso", formatVersion: 1, applicationVersion: "4.0.0", generatedAt: new Date().toISOString(), generatedBy: "Gestor Demo", modules: selected, warnings: [], tableCounts: {} }, data: { demo: [{ note: "Exportação demonstrativa sem banco real." }] } };
      } else {
        const response = await fetch(`/api/system/export?modules=${encodeURIComponent(selected.join(","))}`, { cache: "no-store" });
        const body = (await response.json()) as Record<string, unknown> & { error?: string };
        if (!response.ok) throw new Error(body.error || "Falha ao gerar backup.");
        payload = body;
      }
      const content = JSON.stringify(payload, null, 2);
      const blob = new Blob([content], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `pedido-pro-backup-${stamp}.json`; anchor.click(); URL.revokeObjectURL(url);
      const manifest = payload.manifest as { generatedAt?: string; warnings?: unknown[] } | undefined;
      const record: BackupHistory = { id: stamp, generatedAt: manifest?.generatedAt || new Date().toISOString(), modules: [...selected], size: blob.size, warnings: manifest?.warnings?.length || 0 };
      const next = [record, ...history].slice(0, 20); setHistory(next); localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      setMessage("Exportação concluída. Guarde o arquivo em local seguro e restrito.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao gerar backup."); }
    finally { setWorking(false); }
  }

  return <>
    <PageHeader title="Continuidade, backup e modo offline" icon={WifiOff} description="Proteja a operação com exportação assistida, histórico local de backups, fila offline e diagnóstico de sincronização." actions={<button className="btn-primary" onClick={exportBackup} disabled={working}>{working?<Loader2 size={17} className="animate-spin"/>:<Download size={17}/>}Exportar agora</button>} />
    {message&&<div className="mb-5 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm font-semibold text-blue-800">{message}</div>}

    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Card icon={<HardDrive/>} title="Aplicação instalável" text="PWA para cliente, garçom, motoboy e operação mobile." status="Preparado" />
      <Card icon={<CloudOff/>} title="Fila local" text="Operações essenciais usam chaves de idempotência para evitar duplicidade." status="Preparado" />
      <Card icon={<DatabaseBackup/>} title="Exportação operacional" text="Dados administrativos podem ser baixados em JSON pelo gestor." status="Ativa" />
      <Card icon={online?<Wifi/>:<WifiOff/>} title="Conectividade" text={online?"Este navegador está conectado à rede.":"Este navegador está offline; algumas ações serão enfileiradas."} status={online?"Online":"Offline"} alert={!online} />
    </div>

    <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
      <section className="surface p-6"><div className="flex items-start gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-basso-cream text-basso-wine"><DatabaseBackup/></span><div><h2 className="font-display text-2xl font-bold">Backup operacional assistido</h2><p className="text-sm text-black/50">Selecione os módulos. Credenciais, senhas e dados de cartão nunca são exportados.</p></div></div><div className="mt-5 grid gap-3 sm:grid-cols-2">{moduleOptions.map(([key,label])=><label key={key} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${selected.includes(key)?"border-basso-gold bg-basso-cream":"border-black/10 bg-white"}`}><input type="checkbox" checked={selected.includes(key)} onChange={(event)=>setSelected((current)=>event.target.checked?[...current,key]:current.filter((item)=>item!==key))}/><span className="text-sm font-bold">{label}</span></label>)}</div><div className="mt-5 rounded-xl bg-basso-paper p-4"><p className="text-xs font-black uppercase tracking-wide text-black/35">Conteúdo selecionado</p><p className="mt-2 text-sm text-black/60">{selectedLabel||"Nenhum módulo selecionado."}</p></div><div className="mt-4 flex flex-wrap gap-2"><button className="btn-secondary" onClick={()=>setSelected(moduleOptions.map(([key])=>key))}>Selecionar tudo</button><button className="btn-ghost" onClick={()=>setSelected([])}>Limpar seleção</button><button className="btn-primary ml-auto" onClick={exportBackup} disabled={working||!selected.length}>{working?<Loader2 size={17} className="animate-spin"/>:<Download size={17}/>}Gerar arquivo JSON</button></div><div className="mt-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-900"><ShieldCheck className="mt-0.5 shrink-0" size={18}/><p><strong>Restauração protegida:</strong> o pacote não executa restauração automática pelo navegador. A restauração deve ser feita em ambiente controlado, depois de criar um backup do estado atual e revisar o impacto. Isso evita sobrescrever pedidos ou caixa durante a operação.</p></div></section>

      <section className="surface overflow-hidden"><div className="flex items-center gap-3 border-b border-black/5 p-5"><History className="text-basso-wine"/><div><h2 className="font-display text-xl font-bold">Histórico neste navegador</h2><p className="text-xs text-black/45">Registro dos downloads gerados neste dispositivo.</p></div></div><div className="max-h-[520px] divide-y divide-black/5 overflow-y-auto">{history.map((entry)=><div key={entry.id} className="p-4"><div className="flex items-start justify-between gap-3"><div><strong className="text-sm">{new Date(entry.generatedAt).toLocaleString("pt-BR")}</strong><p className="mt-1 text-xs text-black/45">{entry.modules.length} módulos • {(entry.size/1024).toFixed(1)} KB</p></div><span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${entry.warnings?"bg-amber-50 text-amber-800":"bg-emerald-50 text-emerald-700"}`}>{entry.warnings?`${entry.warnings} aviso(s)`:"Gerado"}</span></div></div>)}{!history.length&&<div className="grid min-h-52 place-items-center p-6 text-center"><div><DatabaseBackup className="mx-auto text-black/20" size={36}/><p className="mt-3 text-sm font-semibold text-black/45">Nenhuma exportação registrada neste navegador.</p></div></div>}</div></section>
    </div>

    <section className="surface mt-6 p-6"><h2 className="font-display text-2xl font-bold">Checklist de continuidade</h2><div className="mt-5 grid gap-3 md:grid-cols-2">{["Identificação visual explícita do modo offline","Registro local com chave de idempotência","Sincronização em ordem após reconexão","Prevenção de pedidos e pagamentos duplicados","Última data e horário de sincronização","Histórico de falhas e tentativas","Acesso aos pedidos previamente sincronizados","Impressão local quando configurada"].map((item)=><div key={item} className="flex items-center gap-2 rounded-xl bg-basso-paper p-3 text-sm font-semibold"><CheckCircle2 className="text-emerald-600" size={17}/>{item}</div>)}</div></section>
  </>;
}

function Card({icon,title,text,status,alert=false}:{icon:React.ReactNode;title:string;text:string;status:string;alert?:boolean}){return <div className="surface p-5"><div className="flex justify-between gap-3"><span className={alert?"text-red-600":"text-basso-wine"}>{icon}</span><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${alert?"bg-red-50 text-red-700":"bg-emerald-50 text-emerald-700"}`}>{status.toUpperCase()}</span></div><h2 className="mt-4 font-display text-lg font-bold">{title}</h2><p className="mt-1 text-sm text-black/50">{text}</p></div>}
