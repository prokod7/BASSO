"use client";

import { compactItemName, itemDetails } from "@/lib/item-presentation";
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
} from "lucide-react";
import { PageHeader } from "@/components/internal/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { isDemoMode, shortDateTime } from "@/lib/utils";
import type { PrintProfile } from "@/types";

type JobPayload = {
  order?: {
    id?: string;
    number?: string | number;
    daily_number?: number;
    channel?: string;
    customer_name?: string;
    customer_phone?: string;
    table_number?: number;
    subtotal_cents?: number;
    discount_cents?: number;
    delivery_fee_cents?: number;
    total_cents?: number;
    payment_method?: string;
    change_for_cents?: number;
    notes?: string;
    address?: Record<string, unknown> | null;
  };
  items?: Array<{
    kind?: import("@/types").CartItem["kind"];
    quantity?: number;
    name_snapshot?: string;
    unit_price_cents?: number;
    selection?: Record<string, unknown>;
  }>;
};

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
  payload?: JobPayload;
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
  const [bridgeOnline, setBridgeOnline] = useState(false);
  const [lastHealthAt, setLastHealthAt] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [bridgeModal, setBridgeModal] = useState(false);
  const [editing, setEditing] = useState<PrintProfile | null>(null);
  const [preview, setPreview] = useState<PrintProfile | null>(null);
  const [working, setWorking] = useState<string | null>(null);

  async function load(preserveMessage = false) {
    setLoading(true);
    if (!preserveMessage) setMessage("");
    try {
      if (isDemoMode()) {
        setJobs(demoJobs);
        setProfiles((current) => current.length ? current : demoProfiles);
        setBridge(false);
        setBridgeOnline(false);
        return;
      }
      const [jobsResponse, profilesResponse] = await Promise.all([
        fetch("/api/print/jobs", { cache: "no-store" }),
        fetch("/api/print/profiles", { cache: "no-store" }),
      ]);
      const jobsBody = (await jobsResponse.json()) as { jobs?: Job[]; bridgeConfigured?: boolean; bridgeOnline?: boolean; lastHealthAt?: string | null; error?: string };
      const profilesBody = (await profilesResponse.json()) as { profiles?: PrintProfile[]; error?: string };
      if (!jobsResponse.ok) throw new Error(jobsBody.error || "Falha ao carregar fila.");
      if (!profilesResponse.ok) throw new Error(profilesBody.error || "Falha ao carregar perfis de impressão.");
      setJobs(jobsBody.jobs || []);
      setBridge(Boolean(jobsBody.bridgeConfigured));
      setBridgeOnline(Boolean(jobsBody.bridgeOnline));
      setLastHealthAt(jobsBody.lastHealthAt || null);
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

  function browserPrint(job: Job) {
    if (!job.payload) { setMessage("Este job antigo não possui conteúdo disponível para impressão pelo navegador."); return; }
    const popup = window.open("", "_blank", "width=430,height=760");
    if (!popup) { setMessage("O navegador bloqueou a janela de impressão. Libere pop-ups para este site e tente novamente."); return; }
    popup.document.open();
    popup.document.write(receiptHtml(job));
    popup.document.close();
    setMessage("Comprovante aberto no navegador. Escolha a impressora na janela de impressão.");
  }

  async function testPrint(profile: PrintProfile) {
    setWorking(`test:${profile.key}`); setMessage("");
    try {
      if (isDemoMode()) { setMessage("Teste simulado no modo demonstração."); return; }
      const printerKey = profile.sector === "kitchen" ? "cozinha" : profile.sector === "bar" ? "bar" : "counter";
      const response = await fetch("/api/print/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ printerKey, sector: profile.sector }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Falha ao criar impressão de teste.");
      setMessage(bridgeOnline ? `Teste enviado para ${profile.name}. Aguarde a saída física.` : "Teste entrou na fila, mas o Print Bridge está offline. Use a impressão pelo navegador ou ligue o agente local.");
      await load(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao testar impressão."); }
    finally { setWorking(null); }
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
      <PageHeader title="Impressão e layout das comandas" icon={Printer} description="Administre equipamentos, largura, conexão, setor, vias, impressão automática, ordem dos blocos, destaques e fila real de reprocessamento." actions={<><button className="btn-secondary" onClick={() => void load()}><RefreshCw size={17} />Atualizar</button><button className="btn-primary" onClick={() => setBridgeModal(true)}><Settings2 size={17} />Configurar Print Bridge</button></>} />
      {message && <p className={`mb-4 rounded-xl p-3 text-sm font-semibold ${/falha|erro|bloqueou/i.test(message) ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-800"}`}>{message}</p>}
      <div className="mb-6 grid gap-4 md:grid-cols-4"><Summary label="Perfis ativos" value={profiles.filter((profile) => profile.active).length} tone="green" /><Summary label="Aguardando impressão" value={queued} tone="amber" /><Summary label="Falhas na fila" value={failed} tone="red" /><Summary label="Print Bridge" value={bridgeOnline ? "Online" : bridge ? "Offline" : "Pendente"} tone={bridgeOnline ? "green" : "amber"} /></div>

      <div className={`mb-6 rounded-2xl border p-4 text-sm ${bridgeOnline ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}><strong>{bridgeOnline ? "Print Bridge conectado" : "Print Bridge sem conexão ativa"}</strong><p className="mt-1 text-xs opacity-75">{bridgeOnline ? `Último heartbeat: ${lastHealthAt ? shortDateTime(lastHealthAt) : "agora"}. Você já pode executar impressão de teste.` : "A fila recebe os pedidos, mas a USB só é acionada quando o agente local está rodando. Enquanto estiver offline, use “Navegador” na fila para imprimir manualmente pelo computador."}</p></div>

      <section className="surface overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5"><div><h2 className="font-display text-2xl font-bold">Perfis das impressoras</h2><p className="text-sm text-black/45">A operação usa uma Epson e uma impressora térmica chinesa; o modelo exato é configurado no computador da pizzaria.</p></div><span className="rounded-full bg-basso-paper px-3 py-1 text-xs font-bold text-black/45">58 mm ou 80 mm</span></div>
        {loading ? <div className="grid h-48 place-items-center"><Loader2 className="animate-spin" /></div> : <div className="grid gap-4 p-4 lg:grid-cols-2">{profiles.map((profile) => <article key={profile.key} className={`rounded-3xl border p-5 ${profile.active ? "border-black/5 bg-white" : "border-black/5 bg-stone-50 opacity-70"}`}><div className="flex items-start justify-between gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-basso-cream text-basso-wine"><Printer size={22} /></span><span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${profile.autoPrint ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{profile.autoPrint ? "Automática" : "Manual"}</span></div><h3 className="mt-4 font-display text-xl font-bold">{profile.name}</h3><p className="mt-1 text-sm text-black/45">{profile.manufacturer || "Fabricante não definido"} • {profile.model || "Modelo não definido"}</p><div className="mt-4 grid grid-cols-2 gap-2 text-xs"><Info label="Papel" value={`${profile.widthMm} mm`} /><Info label="Colunas" value={String(profile.paperColumns)} /><Info label="Conexão" value={profile.connectionType} /><Info label="Setor" value={profile.sector} /><Info label="Vias" value={String(profile.copies)} /><Info label="Fonte" value={String(profile.template.fontSize || "normal")} /></div><div className="mt-4 grid grid-cols-3 gap-2"><button className="btn-secondary" onClick={() => setPreview(profile)}><Eye size={16} />Prévia</button><button className="btn-secondary" disabled={!!working} onClick={() => void testPrint(profile)}><Printer size={16} />{working === `test:${profile.key}` ? "Enviando" : "Testar"}</button><button className="btn-primary" onClick={() => setEditing(structuredClone(profile))}><Settings2 size={16} />Editar</button></div></article>)}</div>}
      </section>

      <section className="surface mt-6 overflow-hidden"><div className="flex items-center justify-between border-b p-5"><div><h2 className="font-display text-2xl font-bold">Fila de impressão</h2><p className="text-sm text-black/45">A impressão automática exige o agente local. A opção Navegador funciona como contingência imediata.</p></div><span className="text-xs font-bold text-black/40">{jobs.length} registro(s)</span></div>{loading ? <div className="grid h-48 place-items-center"><Loader2 className="animate-spin" /></div> : <div className="divide-y divide-black/5">{jobs.map((job) => <div key={job.id} className="grid gap-3 p-4 lg:grid-cols-[1fr_.7fr_1fr_1fr_1.4fr_auto] lg:items-center"><strong>{job.order_id ? `Pedido ${job.order_id}` : `Comanda ${job.tab_id || "-"}`}</strong><span className="text-sm capitalize">{job.sector}</span><span className="text-sm text-black/50">{job.printer_key}</span><span className={`flex items-center gap-1 text-xs font-bold ${job.status === "done" ? "text-emerald-700" : job.status === "failed" ? "text-red-700" : job.status === "cancelled" ? "text-stone-500" : "text-amber-700"}`}>{job.status === "done" ? <CheckCircle2 size={15} /> : <TriangleAlert size={15} />} {job.status} • {job.attempts}{job.is_reprint ? " • reimpressão" : ""}</span><div><p className="text-xs text-black/40">{shortDateTime(job.created_at)}</p>{job.last_error && <p className="mt-1 text-xs font-semibold text-red-700">{job.last_error}</p>}</div><div className="flex flex-wrap gap-1"><button className="btn-ghost" disabled={!job.payload} onClick={() => browserPrint(job)}><Printer size={16}/>Navegador</button><button className="btn-ghost" disabled={!!working || job.status === "processing" || job.status === "queued"} onClick={() => retry(job.id)}>{working === job.id ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}Reprocessar</button></div></div>)}{!jobs.length && <p className="p-10 text-center text-sm text-black/45">Nenhum trabalho de impressão registrado.</p>}</div>}</section>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="Editar perfil de impressão" className="sm:max-w-4xl">{editing && <ProfileEditor profile={editing} onChange={setEditing} onSave={() => saveProfile(editing)} working={working === editing.key} />}</Modal>
      <Modal open={Boolean(preview)} onClose={() => setPreview(null)} title="Prévia da comanda">{preview && <ReceiptPreview profile={preview} />}</Modal>
      <Modal open={bridgeModal} onClose={() => setBridgeModal(false)} title="Configuração do Print Bridge"><div className="p-5"><p className="text-sm text-black/55">Execute no computador que permanece ligado junto às impressoras. A mesma chave deve existir na Vercel e no arquivo local.</p><ol className="mt-5 space-y-3 text-sm"><li className="rounded-xl bg-basso-paper p-3"><strong>1.</strong> Configure <code>PRINT_BRIDGE_KEY</code> na Vercel.</li><li className="rounded-xl bg-basso-paper p-3"><strong>2.</strong> Copie <code>bridge/config.example.json</code> para <code>bridge/config.json</code>.</li><li className="rounded-xl bg-basso-paper p-3"><strong>3.</strong> Use a mesma chave, a URL <code>https://basso-pedido-pro.vercel.app</code> e os nomes exatos das impressoras do Windows.</li><li className="rounded-xl bg-basso-paper p-3"><strong>4.</strong> Execute <code>bridge\start-bridge.cmd</code> no computador da pizzaria. O bridge v1.2 envia ESC/POS em modo RAW.</li></ol><button className="btn-secondary mt-5 w-full" onClick={() => navigator.clipboard.writeText("bridge\\start-bridge.cmd")}><Copy size={16} />Copiar comando</button></div></Modal>
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
  return <div className="grid gap-5 p-5 lg:grid-cols-[1fr_340px]"><div className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><label><span className="label">Nome do perfil</span><input className="input" value={profile.name} onChange={(event) => onChange({ ...profile, name: event.target.value })} /></label><label><span className="label">Setor</span><select className="input" value={profile.sector} onChange={(event) => onChange({ ...profile, sector: event.target.value })}><option value="kitchen">Cozinha</option><option value="bar">Bar</option><option value="counter">Balcão / expedição</option><option value="salon">Salão</option></select></label><label><span className="label">Fabricante</span><input className="input" value={profile.manufacturer || ""} onChange={(event) => onChange({ ...profile, manufacturer: event.target.value })} /></label><label><span className="label">Modelo</span><input className="input" value={profile.model || ""} onChange={(event) => onChange({ ...profile, model: event.target.value })} /></label><label><span className="label">Largura</span><select className="input" value={profile.widthMm} onChange={(event) => onChange({ ...profile, widthMm: Number(event.target.value) as 58 | 80, paperColumns: Number(event.target.value) === 58 ? 32 : 42 })}><option value={58}>58 mm</option><option value={80}>80 mm</option></select></label><label><span className="label">Colunas</span><input type="number" min={24} max={64} className="input" value={profile.paperColumns} onChange={(event) => onChange({ ...profile, paperColumns: Number(event.target.value) })} /></label><label><span className="label">Conexão</span><select className="input" value={profile.connectionType} onChange={(event) => onChange({ ...profile, connectionType: event.target.value as PrintProfile["connectionType"] })}><option value="usb">USB</option><option value="network">Rede</option><option value="wifi">Wi-Fi</option><option value="bluetooth">Bluetooth</option><option value="system">Sistema operacional</option></select></label><label><span className="label">Número de vias</span><input type="number" min={1} max={5} className="input" value={profile.copies} onChange={(event) => onChange({ ...profile, copies: Number(event.target.value) })} /></label><label><span className="label">Tamanho da fonte</span><select className="input" value={String(profile.template.fontSize || "normal")} onChange={(event) => onChange({ ...profile, template: { ...profile.template, fontSize: event.target.value as "small" | "normal" | "large" } })}><option value="small">Pequena</option><option value="normal">Normal</option><option value="large">Grande</option></select></label></div><div><span className="label">Conteúdo e destaques</span><div className="grid gap-2 sm:grid-cols-2">{templateToggles.map(({ key, label }) => { const enabled = Boolean(profile.template[key]); return <button key={key} type="button" className={`flex min-h-10 items-center gap-2 rounded-xl border px-3 text-left text-xs font-bold ${enabled ? "border-basso-gold bg-basso-cream text-basso-wine" : "border-black/10 text-black/45"}`} onClick={() => toggleTemplate(key)}><span className={`grid h-5 w-5 place-items-center rounded-md ${enabled ? "bg-basso-wine text-white" : "bg-black/5"}`}>{enabled && <Check size={13} />}</span>{label}</button>; })}</div></div><div><span className="label">Ordem dos blocos</span><div className="space-y-2">{(profile.template.blockOrder || blocks).map((block, index) => <div key={block} className="flex items-center gap-2 rounded-xl bg-basso-paper p-2"><span className="grid h-7 w-7 place-items-center rounded-lg bg-white text-xs font-black">{index + 1}</span><span className="flex-1 text-sm font-bold capitalize">{block}</span><button className="btn-ghost min-h-8 px-2" disabled={index === 0} aria-label={`Mover ${block} para cima`} onClick={() => moveBlock(block, -1)}>↑</button><button className="btn-ghost min-h-8 px-2" disabled={index === (profile.template.blockOrder || blocks).length - 1} aria-label={`Mover ${block} para baixo`} onClick={() => moveBlock(block, 1)}>↓</button></div>)}</div></div><div className="grid grid-cols-2 gap-3"><button type="button" className={`btn-secondary ${profile.active ? "border-emerald-300 bg-emerald-50" : ""}`} onClick={() => onChange({ ...profile, active: !profile.active })}>{profile.active ? "Perfil ativo" : "Perfil inativo"}</button><button type="button" className={`btn-secondary ${profile.autoPrint ? "border-emerald-300 bg-emerald-50" : ""}`} onClick={() => onChange({ ...profile, autoPrint: !profile.autoPrint })}>{profile.autoPrint ? "Impressão automática" : "Impressão manual"}</button></div><button className="btn-primary w-full" disabled={working} onClick={onSave}>{working ? <Loader2 className="animate-spin" size={17} /> : <Save size={17} />}Salvar perfil</button></div><ReceiptPreview profile={profile} compact /></div>;
}

function ReceiptPreview({ profile, compact = false }: { profile: PrintProfile; compact?: boolean }) {
  const width = profile.widthMm === 58 ? "max-w-[280px]" : "max-w-[360px]";
  const font = profile.template.fontSize === "small" ? "text-[10px]" : profile.template.fontSize === "large" ? "text-sm" : "text-xs";
  const blocks: Record<string, React.ReactNode> = {
    header: <div className="text-center">{profile.template.showLogo && <p className="text-lg font-black">LFB</p>}<p className="font-black">LA FORNERIA BASSO</p><p>Pedido #1048</p><p>{new Date().toLocaleString("pt-BR")}</p></div>,
    customer: profile.template.showCustomer && <><p><strong>CLIENTE:</strong> Maria Souza</p><p><strong>TELEFONE:</strong> (11) 97000-0000</p></>,
    items: <><p className="font-black">1x PIZZA GRANDE</p><p>1/2 Calabresa Tradicional</p><p>1/2 Mozzarella</p><p>Massa tradicional</p><p className={`mt-1 ${profile.template.highlightRemovals ? "font-black" : ""}`}>SEM CEBOLA</p><p className="mt-1">+ Bacon</p></>,
    payment: profile.template.showPayment && <><p><strong>TOTAL:</strong> R$ 65,00</p><p><strong>PAGAMENTO:</strong> PIX</p></>,
    address: profile.template.showAddress && <><p>Rua das Flores, 120</p><p>Centro • Casa 2</p></>,
    notes: <><p className={profile.template.highlightNotes ? "font-black" : ""}>OBSERVAÇÃO:</p><p>Entregar na portaria.</p></>,
  };
  return <div aria-label="Prévia do comprovante" className={`${compact ? "sticky top-2" : "m-5 mx-auto"} ${width} w-full bg-white p-5 font-mono shadow-xl ${font}`}>
    {(profile.template.blockOrder || Object.keys(blocks)).map(block => blocks[block] && <div key={block} data-receipt-block={block} className="border-b border-dashed border-black py-3">{blocks[block]}</div>)}
    <p className="mt-4 text-center">{profile.widthMm} mm • {profile.paperColumns} colunas</p>
  </div>;
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char] || char);
}

function receiptHtml(job: Job) {
  const payload = job.payload || {};
  const order = payload.order || {};
  const items = payload.items || [];
  const money = (cents: unknown) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(cents || 0) / 100);
  const rows = items.map(item => {
    const normalized = { ...item, name: String(item.name_snapshot || "Item"), kind: item.kind || "product" } as import("@/types").CartItem;
    const extras = itemDetails(normalized);
    return `<section class="item"><strong>${escapeHtml(item.quantity || 1)}x ${escapeHtml(compactItemName(normalized))}</strong><span>${money(item.unit_price_cents)}</span>${extras.map(line => `<small style="white-space:pre-wrap">${escapeHtml(line.text)}</small>`).join("")}</section>`;
  }).join("");
  const address = order.address || {};
  const addressText = [address.street, address.number, address.district, address.city, address.state].filter(Boolean).map(escapeHtml).join(" • ");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Pedido ${escapeHtml(order.daily_number || order.number || order.id || job.order_id || job.id)}</title><style>@page{margin:4mm}*{box-sizing:border-box}body{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;margin:0 auto;padding:4mm;max-width:80mm;color:#000;font-size:12px}.center{text-align:center}.line{border-top:1px dashed #000;margin:8px 0}.item{padding:7px 0;border-bottom:1px dashed #777}.item strong,.item span,.item small{display:block}.item span{margin-top:2px}.item small{margin-top:3px}.total{font-size:16px;font-weight:800}.muted{font-size:10px}@media print{button{display:none}}</style></head><body><div class="center"><strong>LA FORNERIA BASSO</strong><div>${escapeHtml(job.sector).toUpperCase()}${job.is_reprint ? " • REIMPRESSÃO" : ""}</div></div><div class="line"></div><strong>PEDIDO #${escapeHtml(order.daily_number || order.number || order.id || job.order_id || "")}</strong><div>Cliente: ${escapeHtml(order.customer_name || "")}</div>${order.customer_phone ? `<div>Telefone: ${escapeHtml(order.customer_phone)}</div>` : ""}${order.table_number ? `<div>Mesa: ${escapeHtml(order.table_number)}</div>` : ""}<div class="line"></div>${rows}<div class="line"></div>${order.subtotal_cents != null ? `<div>Subtotal: ${money(order.subtotal_cents)}</div>` : ""}${Number(order.discount_cents || 0) ? `<div>Desconto: -${money(order.discount_cents)}</div>` : ""}${Number(order.delivery_fee_cents || 0) ? `<div>Entrega: ${money(order.delivery_fee_cents)}</div>` : ""}${order.total_cents != null ? `<div class="total">TOTAL: ${money(order.total_cents)}</div>` : ""}${order.payment_method ? `<div>Pagamento: ${escapeHtml(order.payment_method).toUpperCase()}</div>` : ""}${addressText ? `<div class="line"></div><strong>ENDEREÇO</strong><div>${addressText}</div>${address.cep ? `<div>CEP: ${escapeHtml(address.cep)}</div>` : ""}` : ""}${order.notes ? `<div class="line"></div><strong>OBS:</strong><div>${escapeHtml(order.notes)}</div>` : ""}<div class="line"></div><div class="center muted">${new Date().toLocaleString("pt-BR")}</div><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),150));<\/script></body></html>`;
}
