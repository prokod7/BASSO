"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  Copy,
  Eye,
  Loader2,
  Printer,
  RefreshCw,
  Save,
  Settings2,
  TriangleAlert,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/internal/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { isDemoMode, shortDateTime } from "@/lib/utils";
import type { PrintProfile } from "@/types";

type Job = {
  id: string;
  order_id?: string;
  tab_id?: string;
  sector: string;
  printer_key: string;
  status: "queued" | "processing" | "done" | "failed" | "cancelled";
  attempts: number;
  is_reprint: boolean;
  last_error?: string;
  created_at: string;
  processed_at?: string;
};

const demoJobs: Job[] = [
  { id: "print_1", order_id: "order_1048", sector: "kitchen", printer_key: "kitchen-main", status: "done", attempts: 1, is_reprint: false, created_at: new Date(Date.now() - 15 * 60_000).toISOString() },
  { id: "print_2", order_id: "order_1049", sector: "counter", printer_key: "counter-main", status: "queued", attempts: 0, is_reprint: false, created_at: new Date(Date.now() - 3 * 60_000).toISOString() },
];
const demoProfiles: PrintProfile[] = [
  { key: "kitchen-main", name: "Cozinha principal", manufacturer: "Epson", model: "A definir", widthMm: 80, paperColumns: 42, connectionType: "usb", connectionConfig: {}, sector: "kitchen", autoPrint: false, copies: 1, active: true, template: { fontSize: "normal", showLogo: false, showCustomer: true, showPayment: true, showAddress: false, highlightNotes: true, highlightRemovals: true, blockOrder: ["header", "items", "notes"] } },
  { key: "counter-main", name: "Balcão / expedição", manufacturer: "Genérica", model: "Impressora chinesa", widthMm: 58, paperColumns: 32, connectionType: "usb", connectionConfig: {}, sector: "counter", autoPrint: false, copies: 1, active: true, template: { fontSize: "normal", showLogo: false, showCustomer: true, showPayment: true, showAddress: true, highlightNotes: true, highlightRemovals: true, blockOrder: ["header", "customer", "items", "payment", "address", "notes"] } },
];

export default function PrintPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [profiles, setProfiles] = useState<PrintProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [bridge, setBridge] = useState(false);
  const [message, setMessage] = useState("");
  const [bridgeModal, setBridgeModal] = useState(false);
  const [editing, setEditing] = useState<PrintProfile | null>(null);
  const [preview, setPreview] = useState<PrintProfile | null>(null);
  const [working, setWorking] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      if (isDemoMode()) {
        setJobs(demoJobs);
        setProfiles((current) => current.length ? current : demoProfiles);
        setBridge(false);
        return;
      }
      const [jobsResponse, profilesResponse] = await Promise.all([
        fetch("/api/print/jobs", { cache: "no-store" }),
        fetch("/api/print/profiles", { cache: "no-store" }),
      ]);
      const jobsBody = (await jobsResponse.json()) as { jobs?: Job[]; bridgeConfigured?: boolean; error?: string };
      const profilesBody = (await profilesResponse.json()) as { profiles?: PrintProfile[]; error?: string };
      if (!jobsResponse.ok) throw new Error(jobsBody.error || "Falha ao carregar fila.");
      if (!profilesResponse.ok) throw new Error(profilesBody.error || "Falha ao carregar perfis de impressão.");
      setJobs(jobsBody.jobs || []);
      setBridge(Boolean(jobsBody.bridgeConfigured));
      setProfiles(profilesBody.profiles || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao carregar impressão.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function retry(jobId: string) {
    setWorking(jobId);
    setMessage("");
    try {
      if (!isDemoMode()) {
        const response = await fetch("/api/print/retry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId }) });
        const body = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(body.error || "Falha ao reprocessar.");
      }
      setJobs((current) => current.map((job) => job.id === jobId ? { ...job, status: "queued", last_error: undefined } : job));
      setMessage("Trabalho devolvido à fila. O agente local precisa estar conectado para confirmar a impressão física.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao reprocessar.");
    } finally {
      setWorking(null);
    }
  }

  async function saveProfile(profile: PrintProfile) {
    setWorking(profile.key);
    setMessage("");
    try {
      if (!isDemoMode()) {
        const response = await fetch(`/api/print/profiles/${encodeURIComponent(profile.key)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: profile.name, manufacturer: profile.manufacturer || null, model: profile.model || null, widthMm: profile.widthMm, paperColumns: profile.paperColumns, connectionType: profile.connectionType, connectionConfig: profile.connectionConfig, sector: profile.sector, autoPrint: profile.autoPrint, copies: profile.copies, active: profile.active, template: profile.template }) });
        const body = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(body.error || "Falha ao salvar perfil.");
      }
      setProfiles((current) => current.map((item) => item.key === profile.key ? profile : item));
      setEditing(null);
      setMessage("Perfil de impressão salvo e auditado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao salvar perfil.");
    } finally {
      setWorking(null);
    }
  }

  const failed = useMemo(() => jobs.filter((job) => job.status === "failed").length, [jobs]);
  const queued = useMemo(() => jobs.filter((job) => job.status === "queued" || job.status === "processing").length, [jobs]);

  return (
    <>
      <PageHeader title="Impressão e layout das comandas" icon={Printer} description="Administre equipamentos, largura, conexão, setor, vias, impressão automática, ordem dos blocos, destaques e fila real de reprocessamento." actions={<><button className="btn-secondary" onClick={load}><RefreshCw size={17} />Atualizar</button><button className="btn-primary" onClick={() => setBridgeModal(true)}><Settings2 size={17} />Configurar Print Bridge</button></>} />
      {message && <p className={`mb-4 rounded-xl p-3 text-sm font-semibold ${/falha|erro/i.test(message) ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-800"}`}>{message}</p>}
      <div className="mb-6 grid gap-4 md:grid-cols-4"><Summary label="Perfis ativos" value={profiles.filter((profile) => profile.active).length} tone="green" /><Summary label="Aguardando impressão" value={queued} tone="amber" /><Summary label="Falhas na fila" value={failed} tone="red" /><Summary label="Print Bridge" value={bridge ? "Configurado" : "Pendente"} tone={bridge ? "green" : "amber"} /></div>

      <section className="surface overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5"><div><h2 className="font-display text-2xl font-bold">Perfis das impressoras</h2><p className="text-sm text-black/45">A operação usa uma Epson e uma impressora térmica chinesa; o modelo exato será definido na implantação.</p></div><span className="rounded-full bg-basso-paper px-3 py-1 text-xs font-bold text-black/45">58 mm ou 80 mm</span></div>
        {loading ? <div className="grid h-48 place-items-center"><Loader2 className="animate-spin" /></div> : <div className="grid gap-4 p-4 lg:grid-cols-2">{profiles.map((profile) => <article key={profile.key} className={`rounded-3xl border p-5 ${profile.active ? "border-black/5 bg-white" : "border-black/5 bg-stone-50 opacity-70"}`}><div className="flex items-start justify-between gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-basso-cream text-basso-wine"><Printer size={22} /></span><span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${profile.autoPrint ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{profile.autoPrint ? "Automática" : "Manual"}</span></div><h3 className="mt-4 font-display text-xl font-bold">{profile.name}</h3><p className="mt-1 text-sm text-black/45">{profile.manufacturer || "Fabricante não definido"} • {profile.model || "Modelo não definido"}</p><div className="mt-4 grid grid-cols-2 gap-2 text-xs"><Info label="Papel" value={`${profile.widthMm} mm`} /><Info label="Colunas" value={String(profile.paperColumns)} /><Info label="Conexão" value={profile.connectionType} /><Info label="Setor" value={profile.sector} /><Info label="Vias" value={String(profile.copies)} /><Info label="Fonte" value={String(profile.template.fontSize || "normal")} /></div><div className="mt-4 grid grid-cols-2 gap-2"><button className="btn-secondary" onClick={() => setPreview(profile)}><Eye size={16} />Prévia</button><button className="btn-primary" onClick={() => setEditing(structuredClone(profile))}><Settings2 size={16} />Editar perfil</button></div></article>)}</div>}
      </section>

      <section className="surface mt-6 overflow-hidden"><div className="flex items-center justify-between border-b p-5"><div><h2 className="font-display text-2xl font-bold">Fila de impressão</h2><p className="text-sm text-black/45">Nenhum trabalho é marcado como impresso sem confirmação do agente local.</p></div><span className="text-xs font-bold text-black/40">{jobs.length} registro(s)</span></div>{loading ? <div className="grid h-48 place-items-center"><Loader2 className="animate-spin" /></div> : <div className="divide-y divide-black/5">{jobs.map((job) => <div key={job.id} className="grid gap-3 p-4 lg:grid-cols-[1fr_.7fr_1fr_1fr_1.4fr_auto] lg:items-center"><strong>{job.order_id ? `Pedido ${job.order_id}` : `Comanda ${job.tab_id || "-"}`}</strong><span className="text-sm capitalize">{job.sector}</span><span className="text-sm text-black/50">{job.printer_key}</span><span className={`flex items-center gap-1 text-xs font-bold ${job.status === "done" ? "text-emerald-700" : job.status === "failed" ? "text-red-700" : "text-amber-700"}`}>{job.status === "done" ? <CheckCircle2 size={15} /> : <TriangleAlert size={15} />} {job.status} • {job.attempts}{job.is_reprint ? " • reimpressão" : ""}</span><div><p className="text-xs text-black/40">{shortDateTime(job.created_at)}</p>{job.last_error && <p className="mt-1 text-xs font-semibold text-red-700">{job.last_error}</p>}</div><button className="btn-ghost" disabled={working === job.id} onClick={() => retry(job.id)}>{working === job.id ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}Reprocessar</button></div>)}{!jobs.length && <p className="p-10 text-center text-sm text-black/45">Nenhum trabalho de impressão registrado.</p>}</div>}</section>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="Editar perfil de impressão" className="sm:max-w-4xl">{editing && <ProfileEditor profile={editing} onChange={setEditing} onSave={() => saveProfile(editing)} working={working === editing.key} />}</Modal>
      <Modal open={Boolean(preview)} onClose={() => setPreview(null)} title="Prévia da comanda">{preview && <ReceiptPreview profile={preview} />}</Modal>
      <Modal open={bridgeModal} onClose={() => setBridgeModal(false)} title="Configuração do Print Bridge"><div className="p-5"><p className="text-sm text-black/55">Execute no computador que permanece ligado junto às impressoras. A mesma chave deve existir na Vercel e no arquivo local.</p><ol className="mt-5 space-y-3 text-sm"><li className="rounded-xl bg-basso-paper p-3"><strong>1.</strong> Configure <code>PRINT_BRIDGE_KEY</code> na Vercel.</li><li className="rounded-xl bg-basso-paper p-3"><strong>2.</strong> Copie <code>bridge/config.example.json</code> para <code>bridge/config.json</code>.</li><li className="rounded-xl bg-basso-paper p-3"><strong>3.</strong> Use a mesma chave e informe a URL do sistema.</li><li className="rounded-xl bg-basso-paper p-3"><strong>4.</strong> Rode <code>node bridge/print-bridge.mjs</code> no computador da pizzaria.</li></ol><button className="btn-secondary mt-5 w-full" onClick={() => navigator.clipboard.writeText("node bridge/print-bridge.mjs")}><Copy size={16} />Copiar comando</button></div></Modal>
    </>
  );
}

function Summary({ label, value, tone }: { label: string; value: string | number; tone: "green" | "amber" | "red" }) { const styles = tone === "green" ? "bg-emerald-50 text-emerald-700" : tone === "amber" ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-700"; return <div className="surface p-4"><div className={`mb-3 h-2 w-10 rounded-full ${styles.split(" ")[0]}`} /><strong className="block text-2xl">{value}</strong><span className="text-xs text-black/45">{label}</span></div>; }
function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-basso-paper p-3"><span className="block text-[9px] font-black uppercase text-black/35">{label}</span><strong className="mt-1 block capitalize">{value}</strong></div>; }

type BooleanTemplateKey = "showLogo" | "showCustomer" | "showPayment" | "showAddress" | "highlightNotes" | "highlightRemovals";

const templateToggles: ReadonlyArray<{ key: BooleanTemplateKey; label: string }> = [
  { key: "showLogo", label: "Mostrar logo" },
  { key: "showCustomer", label: "Mostrar cliente" },
  { key: "showPayment", label: "Mostrar pagamento" },
  { key: "showAddress", label: "Mostrar endereço" },
  { key: "highlightNotes", label: "Destacar observações" },
  { key: "highlightRemovals", label: "Destacar retiradas" },
];

function ProfileEditor({ profile, onChange, onSave, working }: { profile: PrintProfile; onChange: (profile: PrintProfile) => void; onSave: () => void; working: boolean }) {
  const blocks = ["header", "customer", "items", "payment", "address", "notes"];
  function toggleTemplate(key: BooleanTemplateKey) {
    const enabled = Boolean(profile.template[key]);
    onChange({ ...profile, template: { ...profile.template, [key]: !enabled } });
  }
  function moveBlock(block: string, direction: -1 | 1) { const order = [...(profile.template.blockOrder || blocks)]; const index = order.indexOf(block); const target = index + direction; if (index < 0 || target < 0 || target >= order.length) return; [order[index], order[target]] = [order[target], order[index]]; onChange({ ...profile, template: { ...profile.template, blockOrder: order } }); }
  return <div className="grid gap-5 p-5 lg:grid-cols-[1fr_340px]"><div className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><label><span className="label">Nome do perfil</span><input className="input" value={profile.name} onChange={(event) => onChange({ ...profile, name: event.target.value })} /></label><label><span className="label">Setor</span><select className="input" value={profile.sector} onChange={(event) => onChange({ ...profile, sector: event.target.value })}><option value="kitchen">Cozinha</option><option value="bar">Bar</option><option value="counter">Balcão / expedição</option><option value="salon">Salão</option></select></label><label><span className="label">Fabricante</span><input className="input" value={profile.manufacturer || ""} onChange={(event) => onChange({ ...profile, manufacturer: event.target.value })} /></label><label><span className="label">Modelo</span><input className="input" value={profile.model || ""} onChange={(event) => onChange({ ...profile, model: event.target.value })} /></label><label><span className="label">Largura</span><select className="input" value={profile.widthMm} onChange={(event) => onChange({ ...profile, widthMm: Number(event.target.value) as 58 | 80, paperColumns: Number(event.target.value) === 58 ? 32 : 42 })}><option value={58}>58 mm</option><option value={80}>80 mm</option></select></label><label><span className="label">Colunas</span><input type="number" min={24} max={64} className="input" value={profile.paperColumns} onChange={(event) => onChange({ ...profile, paperColumns: Number(event.target.value) })} /></label><label><span className="label">Conexão</span><select className="input" value={profile.connectionType} onChange={(event) => onChange({ ...profile, connectionType: event.target.value as PrintProfile["connectionType"] })}><option value="usb">USB</option><option value="network">Rede</option><option value="wifi">Wi-Fi</option><option value="bluetooth">Bluetooth</option><option value="system">Sistema operacional</option></select></label><label><span className="label">Número de vias</span><input type="number" min={1} max={5} className="input" value={profile.copies} onChange={(event) => onChange({ ...profile, copies: Number(event.target.value) })} /></label><label><span className="label">Tamanho da fonte</span><select className="input" value={String(profile.template.fontSize || "normal")} onChange={(event) => onChange({ ...profile, template: { ...profile.template, fontSize: event.target.value as "small" | "normal" | "large" } })}><option value="small">Pequena</option><option value="normal">Normal</option><option value="large">Grande</option></select></label></div><div><span className="label">Conteúdo e destaques</span><div className="grid gap-2 sm:grid-cols-2">{templateToggles.map(({ key, label }) => { const enabled = Boolean(profile.template[key]); return <button key={key} type="button" className={`flex min-h-10 items-center gap-2 rounded-xl border px-3 text-left text-xs font-bold ${enabled ? "border-basso-gold bg-basso-cream text-basso-wine" : "border-black/10 text-black/45"}`} onClick={() => toggleTemplate(key)}><span className={`grid h-5 w-5 place-items-center rounded-md ${enabled ? "bg-basso-wine text-white" : "bg-black/5"}`}>{enabled && <Check size={13} />}</span>{label}</button>; })}</div></div><div><span className="label">Ordem dos blocos</span><div className="space-y-2">{(profile.template.blockOrder || blocks).map((block, index) => <div key={block} className="flex items-center gap-2 rounded-xl bg-basso-paper p-2"><span className="grid h-7 w-7 place-items-center rounded-lg bg-white text-xs font-black">{index + 1}</span><span className="flex-1 text-sm font-bold capitalize">{block}</span><button className="btn-ghost min-h-8 px-2" disabled={index === 0} onClick={() => moveBlock(block, -1)}>↑</button><button className="btn-ghost min-h-8 px-2" disabled={index === (profile.template.blockOrder || blocks).length - 1} onClick={() => moveBlock(block, 1)}>↓</button></div>)}</div></div><div className="grid grid-cols-2 gap-3"><button type="button" className={`btn-secondary ${profile.active ? "border-emerald-300 bg-emerald-50" : ""}`} onClick={() => onChange({ ...profile, active: !profile.active })}>{profile.active ? "Perfil ativo" : "Perfil inativo"}</button><button type="button" className={`btn-secondary ${profile.autoPrint ? "border-emerald-300 bg-emerald-50" : ""}`} onClick={() => onChange({ ...profile, autoPrint: !profile.autoPrint })}>{profile.autoPrint ? "Impressão automática" : "Impressão manual"}</button></div><button className="btn-primary w-full" disabled={working} onClick={onSave}>{working ? <Loader2 className="animate-spin" size={17} /> : <Save size={17} />}Salvar perfil</button></div><ReceiptPreview profile={profile} compact /></div>;
}

function ReceiptPreview({ profile, compact = false }: { profile: PrintProfile; compact?: boolean }) { const width = profile.widthMm === 58 ? "max-w-[280px]" : "max-w-[360px]"; const font = profile.template.fontSize === "small" ? "text-[10px]" : profile.template.fontSize === "large" ? "text-sm" : "text-xs"; return <div className={`${compact ? "sticky top-2" : "m-5 mx-auto"} ${width} w-full bg-white p-5 font-mono shadow-xl ${font}`}><div className="border-b border-dashed border-black pb-3 text-center">{profile.template.showLogo && <p className="text-lg font-black">LFB</p>}<p className="font-black">LA FORNERIA BASSO</p><p>Pedido #1048</p><p>{new Date().toLocaleString("pt-BR")}</p></div>{profile.template.showCustomer && <div className="border-b border-dashed border-black py-3"><p><strong>CLIENTE:</strong> Maria Souza</p><p><strong>TELEFONE:</strong> (11) 97000-0000</p></div>}<div className="border-b border-dashed border-black py-3"><p className="font-black">1x PIZZA GRANDE</p><p>1/2 Calabresa Tradicional</p><p>1/2 Mozzarella</p><p>Massa tradicional</p>{profile.template.highlightRemovals && <p className="mt-1 font-black">SEM CEBOLA</p>}<p className="mt-1">+ Bacon</p></div>{profile.template.showPayment && <div className="border-b border-dashed border-black py-3"><p><strong>TOTAL:</strong> R$ 65,00</p><p><strong>PAGAMENTO:</strong> PIX</p></div>}{profile.template.showAddress && <div className="border-b border-dashed border-black py-3"><p>Rua das Flores, 120</p><p>Centro • Casa 2</p></div>}{profile.template.highlightNotes && <div className="pt-3"><p className="font-black">OBSERVAÇÃO:</p><p>Entregar na portaria.</p></div>}<p className="mt-4 text-center">{profile.widthMm} mm • {profile.paperColumns} colunas</p></div>; }
