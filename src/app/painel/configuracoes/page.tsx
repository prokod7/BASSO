"use client";

import { FormEvent, useEffect, useState } from "react";
import { DistrictsManager } from "@/components/internal/DistrictsManager";
import { Building2, Clock3, Info, LifeBuoy, CreditCard, Edit3, Image as ImageIcon, MapPin, PauseCircle, PlayCircle, Plus, Save, Settings, Trash2, Truck, Users, X } from "lucide-react";
import { PageHeader } from "@/components/internal/PageHeader";
import { SYSTEM_VERSION } from "@/lib/app-version";
import { VENDRA_SUPPORT_URL } from "@/lib/vendra";
import { TablesManager } from "@/components/internal/TablesManager";
import { currency, isDemoMode, parseMoneyInput, uid } from "@/lib/utils";

import { catalog, defaultCategoryImages } from "@/lib/catalog";
import { DEFAULT_PIZZA_OPTIONS, normalizePizzaOptions, type MassId, type PizzaOptionItem, type PizzaOptions } from "@/lib/pizza-options";
import { dayKeys,weekdayPt,type OpeningHours } from "@/lib/opening-hours";

type FormState = {
  name:string; phone:string; contactPhones:string; instagram:string; openingHours:OpeningHours;
  minimumOrder: string;
  maximumDeliveryKm: string;
  pixKey: string;
  pixKeyType: string;
  pixConfirmation: "manual" | "automatic";
  serviceFeePercent: string;
  waiterCommissionPercent: string;
  schedulingEnabled: boolean;
  fiscalMode: "non_fiscal" | "nfce" | "external";
  preparationCapacityPerSlot: string;
  street: string; number: string; district: string; city: string; state: string;
  whatsapp: string;
  heroBadge: string; heroTitle: string; heroSubtitle: string;
  cnpj: string;
  subtitles: Record<"featured"|"traditional"|"premium"|"sweet", string>;
  pizzaOptions: PizzaOptions;
};
type Runtime = { operationalStatus: "open"|"paused"|"closed"; acceptingOrders: boolean; pauseReason?: string; manualOverride: boolean; preparationMinutes: number; deliveryMinutes: number; publicMessage?: string };
const SITE_SLOTS: Array<{ key: string; label: string; fallback: string }> = [
  { key: "hero", label: "Foto do topo do site", fallback: "/assets/brand/banner-institucional.png" },
  { key: "featured.grande", label: "Mais pedidas — Grande", fallback: defaultCategoryImages.featured.grande },
  { key: "featured.broto", label: "Mais pedidas — Broto", fallback: defaultCategoryImages.featured.broto },
  { key: "traditional.grande", label: "Tradicionais — Grande", fallback: defaultCategoryImages.traditional.grande },
  { key: "traditional.broto", label: "Tradicionais — Broto", fallback: defaultCategoryImages.traditional.broto },
  { key: "premium.grande", label: "Premium — Grande", fallback: defaultCategoryImages.premium.grande },
  { key: "premium.broto", label: "Premium — Broto", fallback: defaultCategoryImages.premium.broto },
  { key: "sweet.grande", label: "Doces — Grande", fallback: defaultCategoryImages.sweet.grande },
  { key: "sweet.broto", label: "Doces — Broto", fallback: defaultCategoryImages.sweet.broto },
];
type Zone = { id: string; name: string; city: string; districts: string[]; fee_cents: number; minimum_order_cents: number; max_distance_km: number | null; active: boolean };
const DEMO_KEY = "lfb-settings-v31";
const defaults: FormState = { name:"La Forneria Basso",phone:"(11) 97235-6751",contactPhones:"",instagram:"@laforneriabasso",openingHours:catalog.business.hours as OpeningHours, minimumOrder: "0", maximumDeliveryKm: "", pixKey: "", pixKeyType: "cpf_cnpj", pixConfirmation: "manual", serviceFeePercent: "0", waiterCommissionPercent: "0", schedulingEnabled: true, fiscalMode: "non_fiscal", preparationCapacityPerSlot: "", street: "Rua do Progresso", number: "407", district: "Centro", city: "Rio Grande da Serra", state: "SP", whatsapp: "", heroBadge: "", heroTitle: "", heroSubtitle: "", cnpj: "62.332.415/0001-10", subtitles: { featured: "", traditional: "", premium: "", sweet: "" }, pizzaOptions: DEFAULT_PIZZA_OPTIONS };

export default function SettingsPage() {
  const [form, setForm] = useState(defaults);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [showZone, setShowZone] = useState(false);
  const [editingZone, setEditingZone] = useState<Zone | null>(null);
  const [zoneCity, setZoneCity] = useState("");
  const [zoneName, setZoneName] = useState("");
  const [districts, setDistricts] = useState("");
  const [zoneFee, setZoneFee] = useState("");
  const [zoneMinimum, setZoneMinimum] = useState("");
  const [siteImages, setSiteImages] = useState<Record<string, string>>({});
  const [imageBusy, setImageBusy] = useState("");
  const [runtime, setRuntime] = useState<Runtime | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        if (isDemoMode()) {
          const parsed = JSON.parse(localStorage.getItem(DEMO_KEY) || "null") as { form?: FormState; zones?: Zone[] } | null;
          if (!cancelled && parsed) { setForm({ ...defaults, ...(parsed.form || {}) }); setZones(parsed.zones || []); }
        } else {
          const response = await fetch("/api/settings", { cache: "no-store" });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error || "Falha ao carregar configurações.");
          const config = body.settings?.config || {};
          if (!cancelled) {
            setForm({
              name:body.settings.name,phone:body.settings.phone,contactPhones:(config.contactPhones||[]).join("\n"),instagram:body.settings.instagram||"",openingHours:body.settings.opening_hours||defaults.openingHours,
              minimumOrder: String((body.settings?.minimum_order_cents || 0) / 100),
              maximumDeliveryKm: config.maximumDeliveryKm == null ? "" : String(config.maximumDeliveryKm),
              pixKey: config.pixKey || "", pixKeyType: config.pixKeyType || "cpf_cnpj",
              pixConfirmation: config.pixConfirmation || "manual",
              serviceFeePercent: String(config.serviceFeePercent || 0), waiterCommissionPercent: String(config.waiterCommissionPercent || 0),
              schedulingEnabled: config.schedulingEnabled !== false, fiscalMode: config.fiscalMode || "non_fiscal",
              preparationCapacityPerSlot: config.preparationCapacityPerSlot == null ? "" : String(config.preparationCapacityPerSlot),
              street: body.settings.address?.street || defaults.street, number: body.settings.address?.number || defaults.number, district: body.settings.address?.district || "", city: body.settings.address?.city || defaults.city, state: body.settings.address?.state || "SP",
              whatsapp: config.whatsapp || "",
              heroBadge: config.site?.heroBadge || "", heroTitle: config.site?.heroTitle || "", heroSubtitle: config.site?.heroSubtitle || "",
              cnpj: body.settings.cnpj || "",
              subtitles: { featured: config.site?.sectionSubtitles?.featured || "", traditional: config.site?.sectionSubtitles?.traditional || "", premium: config.site?.sectionSubtitles?.premium || "", sweet: config.site?.sectionSubtitles?.sweet || "" },
              pizzaOptions: normalizePizzaOptions(config.pizzaOptions),
            });
            setSiteImages(config.site?.images || {});
            setZones((body.deliveryZones || []).map((zone: Zone) => ({ ...zone, city: zone.city || zone.name.split(" — ")[0] || "" })));
          }
          const statusResponse = await fetch("/api/store-status", { cache: "no-store" });
          const statusBody = await statusResponse.json().catch(() => null);
          if (!cancelled && statusResponse.ok && statusBody) setRuntime({ operationalStatus: statusBody.operationalStatus, acceptingOrders: Boolean(statusBody.acceptingOrders), pauseReason: statusBody.pauseReason, manualOverride: Boolean(statusBody.manualOverride), preparationMinutes: Number(statusBody.preparationMinutes || 45), deliveryMinutes: Number(statusBody.deliveryMinutes || 60), publicMessage: statusBody.publicMessage || "" });
        }
      } catch (error) { if (!cancelled) setMessage(error instanceof Error ? error.message : "Falha ao carregar."); }
      finally { if (!cancelled) setLoading(false); }
    }
    void load(); return () => { cancelled = true; };
  }, []);

  function numberValue(value: string, scale = 1) { const parsed = Number(value.replace(",", ".")); return Number.isFinite(parsed) ? Math.round(parsed * scale) : 0; }
  function persistDemo(nextForm = form, nextZones = zones) { localStorage.setItem(DEMO_KEY, JSON.stringify({ form: nextForm, zones: nextZones })); }
  async function save() {
    setSaving(true); setMessage("");
    try {
      if (isDemoMode()) persistDemo();
      else {
        const response = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({cnpj:form.cnpj.trim(),address:{street:form.street,number:form.number,district:form.district,city:form.city,state:form.state.toUpperCase()},name:form.name,phone:form.phone,contactPhones:form.contactPhones.split(/[\n;,]/).map(p=>p.trim()).filter(Boolean),instagram:form.instagram,openingHours:form.openingHours, minimumOrder: numberValue(form.minimumOrder, 100), config: { pixKey: form.pixKey || null, pixKeyType: form.pixKeyType || null, pixConfirmation: form.pixConfirmation, serviceFeePercent: numberValue(form.serviceFeePercent), waiterCommissionPercent: numberValue(form.waiterCommissionPercent), schedulingEnabled: form.schedulingEnabled, maximumDeliveryKm: form.maximumDeliveryKm ? Number(form.maximumDeliveryKm.replace(",", ".")) : null, fiscalMode: form.fiscalMode, preparationCapacityPerSlot: form.preparationCapacityPerSlot ? Number(form.preparationCapacityPerSlot) : null, whatsapp: form.whatsapp.replace(/\D/g, "") || null, pizzaOptions: form.pizzaOptions, site: { sectionSubtitles: Object.fromEntries(Object.entries(form.subtitles).map(([key, value]) => [key, value.trim() || null])), heroBadge: form.heroBadge.trim() || null, heroTitle: form.heroTitle.trim() || null, heroSubtitle: form.heroSubtitle.trim() || null } } }) });
        const body = await response.json(); if (!response.ok) throw new Error(body.error || "Falha ao salvar.");
        if (runtime) {
          const statusResponse = await fetch("/api/store-status", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operationalStatus: runtime.operationalStatus, acceptingOrders: runtime.acceptingOrders, pauseReason: runtime.pauseReason || null, manualOverride: runtime.manualOverride, preparationMinutes: runtime.preparationMinutes, deliveryMinutes: runtime.deliveryMinutes, publicMessage: runtime.publicMessage?.trim() || null }) });
          const statusBody = await statusResponse.json(); if (!statusResponse.ok) throw new Error(statusBody.error || "Falha ao salvar tempos de preparo e entrega.");
        }
      }
      setMessage("Configurações salvas e registradas na auditoria.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao salvar."); }
    finally { setSaving(false); }
  }

  async function uploadSiteImage(key: string, file: File) {
    setImageBusy(key); setMessage("");
    try {
      if (isDemoMode()) throw new Error("O envio de fotos exige o banco configurado.");
      const data = new FormData(); data.append("key", key); data.append("file", file);
      const response = await fetch("/api/settings/site-images", { method: "POST", body: data });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "Falha ao enviar foto.");
      setSiteImages(current => ({ ...current, [key]: body.url })); setMessage("Foto atualizada. Ela já aparece no cardápio.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao enviar foto."); }
    finally { setImageBusy(""); }
  }
  async function removeSiteImage(key: string) {
    setImageBusy(key); setMessage("");
    try {
      const response = await fetch("/api/settings/site-images", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "Falha ao remover foto.");
      setSiteImages(current => { const next = { ...current }; delete next[key]; return next; }); setMessage("Foto personalizada removida. O cardápio voltou a usar a foto padrão.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao remover foto."); }
    finally { setImageBusy(""); }
  }

  async function addZone(event: FormEvent) {
    event.preventDefault();
    const districtList = districts.split(",").map(value => value.trim()).filter(Boolean);
    if (zoneCity.trim().length < 2 || !districtList.length) { setMessage("Informe a cidade e pelo menos um bairro."); return; }
    const normalizedName = zoneName.trim() || `${zoneCity.trim()} — ${districtList[0]}`;
    const draft: Zone = { id: uid("zone"), name: normalizedName, city: zoneCity.trim(), districts: districtList, fee_cents: numberValue(zoneFee, 100), minimum_order_cents: numberValue(zoneMinimum, 100), max_distance_km: null, active: true };
    setSaving(true);
    try {
      if (!isDemoMode()) {
        const response = await fetch("/api/settings/delivery-zones", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: draft.name, city: draft.city, districts: draft.districts, fee: draft.fee_cents, minimumOrder: draft.minimum_order_cents, maxDistanceKm: null, active: true }) });
        const body = await response.json(); if (!response.ok) throw new Error(body.error || "Falha ao cadastrar zona."); draft.id = body.id;
      }
      const next = [...zones, draft]; setZones(next); if (isDemoMode()) persistDemo(form, next);
      setZoneCity(""); setZoneName(""); setDistricts(""); setZoneFee(""); setZoneMinimum(""); setShowZone(false); setMessage("Cidade, bairro e taxa cadastrados e disponíveis no checkout e no PDV.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao cadastrar zona."); }
    finally { setSaving(false); }
  }

  async function updateZone(zone: Zone, patch: Partial<Zone>) {
    setSaving(true); setMessage("");
    try {
      const nextZone = { ...zone, ...patch };
      if (!isDemoMode()) {
        const response = await fetch(`/api/settings/delivery-zones/${zone.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: patch.name, city: patch.city, districts: patch.districts, fee: patch.fee_cents, minimumOrder: patch.minimum_order_cents, maxDistanceKm: patch.max_distance_km, active: patch.active }) });
        const body = await response.json(); if (!response.ok) throw new Error(body.error || "Falha ao atualizar zona.");
      }
      const next = zones.map(item => item.id === zone.id ? nextZone : item); setZones(next); if (isDemoMode()) persistDemo(form, next);
      setEditingZone(null); setMessage("Cidade/bairro atualizado. A nova taxa passa a valer nos próximos pedidos.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao atualizar zona."); }
    finally { setSaving(false); }
  }

  async function archiveZone(zone: Zone) {
    if (!window.confirm(`Remover “${zone.name}” da área de entrega? O histórico de pedidos será preservado.`)) return;
    setSaving(true); setMessage("");
    try {
      if (!isDemoMode()) { const response = await fetch(`/api/settings/delivery-zones/${zone.id}`, { method: "DELETE" }); const body = await response.json(); if (!response.ok) throw new Error(body.error || "Falha ao remover zona."); }
      const next = zones.filter(item => item.id !== zone.id); setZones(next); if (isDemoMode()) persistDemo(form, next); setMessage("Zona removida da operação sem apagar o histórico.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao remover zona."); }
    finally { setSaving(false); }
  }

  return <>
    <PageHeader title="Configurações da operação" icon={Settings} description="Controle cobertura, cidades, bairros, taxas, pedido mínimo, Pix, salão e parâmetros operacionais." actions={<button className="btn-primary" onClick={save} disabled={saving || loading}><Save size={17}/>{saving ? "Salvando..." : "Salvar alterações"}</button>} />
    {message && <p className="mb-5 rounded-xl bg-blue-50 p-4 text-sm font-semibold text-blue-800">{message}</p>}
    <div className="grid gap-5 xl:grid-cols-2">
      <Section icon={<Building2/>} title="Estabelecimento"><Grid><Field label="Nome fantasia" value={form.name} onChange={name=>setForm({...form,name})}/><Field label="CNPJ" value={form.cnpj} onChange={cnpj=>setForm({...form,cnpj})}/><Field label="Telefone principal" value={form.phone} onChange={phone=>setForm({...form,phone})}/><Field label="Instagram" value={form.instagram} onChange={instagram=>setForm({...form,instagram})}/><label className="sm:col-span-2"><span className="label">Outros telefones (um por linha)</span><textarea className="textarea" value={form.contactPhones} onChange={e=>setForm({...form,contactPhones:e.target.value})}/></label><label className="sm:col-span-2"><span className="label">WhatsApp de atendimento (com DDI e DDD)</span><input className="input" inputMode="numeric" placeholder="5511999999999" value={form.whatsapp} onChange={e=>setForm({...form,whatsapp:e.target.value})}/><span className="mt-1 block text-xs text-black/45">Usado no botão “Falar no WhatsApp” do acompanhamento do pedido.</span></label><Field label="Rua da loja" value={form.street} onChange={street=>setForm({...form,street})}/><Field label="Número" value={form.number} onChange={number=>setForm({...form,number})}/><Field label="Bairro" value={form.district} onChange={district=>setForm({...form,district})}/><Field label="Cidade" value={form.city} onChange={city=>setForm({...form,city})}/><Field label="UF" value={form.state} onChange={state=>setForm({...form,state:state.slice(0,2)})}/></Grid><p className="mt-3 text-xs text-black/45">O endereço aparece no site, no checkout (retirada) e nas comandas impressas.</p></Section>
      <Section icon={<Settings/>} title="Horários de atendimento"><p className="mb-3 text-sm text-black/50">Fuso de São Paulo. Desmarque os dias fechados. Horários que passam da meia-noite são aceitos. Para seguir estes horários, use o modo automático no controle da loja.</p><div className="space-y-3">{dayKeys.map(day=>{const hours=form.openingHours[day];return <div key={day} className="grid grid-cols-[1fr_100px_100px] items-center gap-2"><label className="flex items-center gap-2 text-sm capitalize"><input type="checkbox" checked={Boolean(hours)} onChange={e=>setForm({...form,openingHours:{...form.openingHours,[day]:e.target.checked?["18:00","23:00"]:null}})}/>{weekdayPt[day]}</label><input aria-label={`Abre ${weekdayPt[day]}`} className="input" type="time" disabled={!hours} value={hours?.[0]||""} onChange={e=>setForm({...form,openingHours:{...form.openingHours,[day]:[e.target.value,hours?.[1]||"23:00"]}})}/><input aria-label={`Fecha ${weekdayPt[day]}`} className="input" type="time" disabled={!hours} value={hours?.[1]||""} onChange={e=>setForm({...form,openingHours:{...form.openingHours,[day]:[hours?.[0]||"18:00",e.target.value]}})}/></div>})}</div></Section>
      <Section icon={<Truck/>} title="Delivery"><Grid><Field label="Pedido mínimo geral (R$)" value={form.minimumOrder} onChange={value=>setForm({...form,minimumOrder:value})}/><Field label="Área máxima (km)" value={form.maximumDeliveryKm} onChange={value=>setForm({...form,maximumDeliveryKm:value})}/><Field label="Capacidade por faixa" value={form.preparationCapacityPerSlot} onChange={value=>setForm({...form,preparationCapacityPerSlot:value})}/><label className="flex items-end gap-3 rounded-xl border p-3"><input type="checkbox" checked={form.schedulingEnabled} onChange={event=>setForm({...form,schedulingEnabled:event.target.checked})}/><span className="text-sm font-bold">Agendamento habilitado</span></label></Grid><button className="btn-secondary mt-4" onClick={()=>setShowZone(value=>!value)}><MapPin size={16}/>{showZone ? "Fechar cadastro" : "Adicionar cidade/bairro"}</button></Section>
      <Section icon={<CreditCard/>} title="Pagamentos"><Grid><Field label="Chave Pix" value={form.pixKey} onChange={value=>setForm({...form,pixKey:value})}/><label><span className="label">Conferência Pix</span><select className="input" value={form.pixConfirmation} onChange={event=>setForm({...form,pixConfirmation:event.target.value as FormState["pixConfirmation"]})}><option value="manual">Manual</option><option value="automatic">Automática (somente com gateway homologado)</option></select></label><ReadOnly label="Integração Rede" value="Aguardando SDK/App2App e homologação da Laranjinha"/><label><span className="label">Modo fiscal</span><select className="input" value={form.fiscalMode} onChange={event=>setForm({...form,fiscalMode:event.target.value as FormState["fiscalMode"]})}><option value="non_fiscal">Comprovante não fiscal</option><option value="nfce">NFC-e</option><option value="external">Integração fiscal externa</option></select></label></Grid></Section>
      <Section icon={<Users/>} title="Salão e permissões"><Grid><TablesManager/><Field label="Taxa de serviço (%)" value={form.serviceFeePercent} onChange={value=>setForm({...form,serviceFeePercent:value})}/><Field label="Comissão garçom (%)" value={form.waiterCommissionPercent} onChange={value=>setForm({...form,waiterCommissionPercent:value})}/><ReadOnly label="Junção de mesas" value="Permitida com auditoria"/></Grid></Section>
    </div>

    <div className="mt-6"><Section icon={<Clock3/>} title="Tempos e aviso no cardápio">{runtime ? <Grid><label><span className="label">Tempo de preparo para retirada (min)</span><input className="input" type="number" min={5} max={240} value={runtime.preparationMinutes} onChange={e=>setRuntime({...runtime,preparationMinutes:Number(e.target.value)})}/></label><label><span className="label">Tempo estimado de entrega (min)</span><input className="input" type="number" min={10} max={300} value={runtime.deliveryMinutes} onChange={e=>setRuntime({...runtime,deliveryMinutes:Number(e.target.value)})}/></label><label className="sm:col-span-2"><span className="label">Aviso no topo do cardápio (opcional)</span><textarea className="textarea min-h-20" maxLength={500} value={runtime.publicMessage || ""} onChange={e=>setRuntime({...runtime,publicMessage:e.target.value})} placeholder="Ex.: Hoje temos borda recheada grátis!"/></label></Grid> : <p className="text-sm text-black/50">{loading ? "Carregando..." : "Não foi possível carregar os tempos agora."}</p>}<p className="mt-3 text-xs text-black/45">Salvar aqui não abre nem fecha a loja; isso continua no botão de status no topo do painel.</p></Section></div>

    <div id="opcoes-pizza" className="mt-6 scroll-mt-24"><Section icon={<Settings/>} title="Opções da pizza"><p className="mb-4 text-sm text-black/50">Nomes, valores extras e disponibilidade aparecem no site, no PDV e no app do garçom, e o servidor cobra exatamente estes valores.</p><div className="grid gap-3 lg:grid-cols-3"><OptionCard title="Base doce opcional" hint="Oferecida nas pizzas doces." value={form.pizzaOptions.hazelnut} onChange={hazelnut=>setForm({...form,pizzaOptions:{...form.pizzaOptions,hazelnut}})}/>{(["traditional","integral"] as MassId[]).map(id=><OptionCard key={id} title={id==="traditional"?"Massa 1":"Massa 2"} hint="Valor extra somado à pizza (0 = sem acréscimo)." value={form.pizzaOptions.masses[id]} onChange={value=>setForm({...form,pizzaOptions:{...form.pizzaOptions,masses:{...form.pizzaOptions.masses,[id]:value}}})}/>)}</div><p className="mt-3 text-xs text-black/45">Pelo menos uma massa precisa ficar disponível. Clique em “Salvar alterações” no topo para publicar.</p></Section></div>

    <div id="site" className="mt-6 scroll-mt-24"><Section icon={<ImageIcon/>} title="Site e fotos do cardápio"><Grid><Field label="Selo do topo" value={form.heroBadge} onChange={heroBadge=>setForm({...form,heroBadge})}/><Field label="Título principal" value={form.heroTitle} onChange={heroTitle=>setForm({...form,heroTitle})}/><label className="sm:col-span-2"><span className="label">Texto de apresentação</span><textarea className="textarea" maxLength={300} value={form.heroSubtitle} onChange={e=>setForm({...form,heroSubtitle:e.target.value})}/></label>{([["featured","Texto da seção “Mais pedidas”"],["traditional","Texto da seção Tradicionais"],["premium","Texto da seção Premium"],["sweet","Texto da seção Doces"]] as const).map(([key,label])=><Field key={key} label={label} value={form.subtitles[key]} onChange={value=>setForm({...form,subtitles:{...form.subtitles,[key]:value}})}/>)}</Grid><p className="mt-2 text-xs text-black/45">O título de cada seção é o nome da categoria (Cardápio → Categorias).</p><p className="mt-2 text-xs text-black/45">Campos vazios usam o texto padrão: “Massa de longa fermentação”, “Pizza artesanal com alma italiana.” e a apresentação atual. Clique em “Salvar alterações” no topo para publicar os textos.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{SITE_SLOTS.map(slot=>{const custom=siteImages[slot.key];const busy=imageBusy===slot.key;return <div key={slot.key} className="flex items-center gap-3 rounded-2xl border p-3"><img src={custom||slot.fallback} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover"/><div className="min-w-0 flex-1"><p className="text-sm font-bold">{slot.label}</p><p className="text-[11px] text-black/45">{custom?"Foto personalizada":"Foto padrão"}</p><div className="mt-2 flex flex-wrap gap-2"><label className={`btn-secondary min-h-9 cursor-pointer px-3 text-xs ${busy?"pointer-events-none opacity-50":""}`}><ImageIcon size={14}/>{busy?"Enviando...":"Trocar foto"}<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="hidden" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void uploadSiteImage(slot.key,file);e.currentTarget.value=""}}/></label>{custom&&<button type="button" className="btn-ghost min-h-9 px-2 text-xs text-red-700" disabled={busy} onClick={()=>void removeSiteImage(slot.key)}>Usar padrão</button>}</div></div></div>})}</div><p className="mt-3 text-xs text-black/45">JPG, PNG, WebP ou AVIF até 5 MB. As fotos são publicadas na hora. Fotos de bebidas, sobremesas e combos são trocadas em Cardápio → Administrar.</p></Section></div>

    <div id="sobre" className="mt-6 scroll-mt-24"><Section icon={<Info/>} title="Sobre o sistema"><div className="flex flex-col gap-5 sm:flex-row sm:items-center"><img src="/assets/vendra/vendra-logo-horizontal.svg" alt="Vendra" className="h-14 w-auto self-start"/><div className="min-w-0 flex-1 text-sm text-black/60"><p className="font-semibold text-black">Sistema desenvolvido e mantido pela Vendra.</p><p className="mt-1">Cardápio digital, PDV, painel de pedidos, garçom, impressão e robô do WhatsApp.</p><p className="mt-1 text-xs text-black/40">Versão {SYSTEM_VERSION}</p></div>{VENDRA_SUPPORT_URL?<a className="btn-primary" href={VENDRA_SUPPORT_URL} target="_blank" rel="noopener noreferrer"><LifeBuoy size={17}/>Falar com o suporte</a>:<p className="text-xs text-black/45">Contato de suporte em breve.</p>}</div></Section></div>
    <section id="bairros" className="mt-6"><div className="mb-3"><h2 className="font-display text-2xl font-bold">Bairros de entrega</h2><p className="text-sm text-black/50">Adicione um bairro novo com a cidade e a taxa, pesquise, mude a taxa ou remova. Vale na hora para o site, o PDV e o robô do WhatsApp.</p></div><DistrictsManager /></section>

    {showZone && <form onSubmit={addZone} className="surface mt-6 p-5"><h2 className="font-display text-xl font-bold">Nova cidade/bairro de entrega</h2><p className="mt-1 text-sm text-black/45">A cidade é usada no checkout; você pode agrupar bairros da mesma cidade quando a taxa for igual.</p><div className="mt-4 grid gap-4 md:grid-cols-5"><Field label="Cidade" value={zoneCity} onChange={setZoneCity}/><Field label="Nome da zona (opcional)" value={zoneName} onChange={setZoneName}/><Field label="Bairros (separados por vírgula)" value={districts} onChange={setDistricts}/><Field label="Taxa (R$)" value={zoneFee} onChange={setZoneFee}/><Field label="Pedido mínimo (R$)" value={zoneMinimum} onChange={setZoneMinimum}/></div><button type="submit" className="btn-primary mt-4" disabled={saving}><Plus size={16}/>Adicionar zona</button></form>}

    <section className="surface mt-6 overflow-hidden"><div className="border-b p-5"><h2 className="font-display text-xl font-bold">Grupos de entrega (avançado: pedido mínimo, pausar, renomear)</h2><p className="mt-1 text-sm text-black/45">Editar altera os próximos pedidos; pausar é reversível; remover arquiva sem apagar o histórico.</p></div><div className="divide-y">{zones.map(zone=><div key={zone.id} className="flex flex-wrap items-center gap-4 p-4"><div className="min-w-0 flex-1"><strong>{zone.name}</strong><p className="text-xs font-semibold text-basso-wine">{zone.city}</p><p className="text-xs text-black/45">{zone.districts.join(", ")}</p></div><span className="text-sm font-bold">{currency(zone.fee_cents)}</span><span className="text-xs text-black/45">mín. {currency(zone.minimum_order_cents)}</span><span className={`rounded-full px-2 py-1 text-xs font-bold ${zone.active?"bg-emerald-50 text-emerald-700":"bg-amber-50 text-amber-700"}`}>{zone.active?"Ativa":"Pausada"}</span><button className="btn-ghost" onClick={()=>setEditingZone(zone)}><Edit3 size={16}/>Editar</button><button className="btn-ghost" disabled={saving} onClick={()=>void updateZone(zone,{active:!zone.active})}>{zone.active?<><PauseCircle size={16}/>Pausar</>:<><PlayCircle size={16}/>Reativar</>}</button><button className="btn-ghost text-red-700" disabled={saving} onClick={()=>void archiveZone(zone)}><Trash2 size={16}/>Remover</button></div>)}{!zones.length&&<p className="p-6 text-sm text-black/45">Nenhum bairro/taxa cadastrado. Enquanto isso, pedidos de entrega permanecem bloqueados com segurança.</p>}</div></section>
    {editingZone&&<ZoneModal zone={editingZone} saving={saving} onClose={()=>setEditingZone(null)} onSave={patch=>void updateZone(editingZone,patch)}/>} 
  </>;
}

function ZoneModal({zone,saving,onClose,onSave}:{zone:Zone;saving:boolean;onClose:()=>void;onSave:(patch:Partial<Zone>)=>void}) {
  const [city,setCity]=useState(zone.city); const [name,setName]=useState(zone.name); const [districtList,setDistrictList]=useState(zone.districts.join(", ")); const [fee,setFee]=useState((zone.fee_cents/100).toFixed(2).replace(".",",")); const [minimum,setMinimum]=useState((zone.minimum_order_cents/100).toFixed(2).replace(".",",")); const [distance,setDistance]=useState(zone.max_distance_km==null?"":String(zone.max_distance_km));
  const cents=(value:string)=>Math.max(0,Math.round((Number(value.replace(",","."))||0)*100));
  return <div className="fixed inset-0 z-[130] grid place-items-center bg-black/55 p-4" onMouseDown={event=>event.target===event.currentTarget&&onClose()}><div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-center justify-between"><h2 className="font-display text-2xl font-bold">Editar cidade/bairro</h2><button className="btn-ghost" onClick={onClose}><X/></button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Cidade" value={city} onChange={setCity}/><Field label="Nome" value={name} onChange={setName}/><Field label="Bairros" value={districtList} onChange={setDistrictList}/><Field label="Taxa (R$)" value={fee} onChange={setFee}/><Field label="Pedido mínimo (R$)" value={minimum} onChange={setMinimum}/><Field label="Distância máxima (km, opcional)" value={distance} onChange={setDistance}/></div><button className="btn-primary mt-6 w-full" disabled={saving||city.trim().length<2||name.trim().length<2||!districtList.trim()} onClick={()=>onSave({city:city.trim(),name:name.trim(),districts:districtList.split(",").map(value=>value.trim()).filter(Boolean),fee_cents:cents(fee),minimum_order_cents:cents(minimum),max_distance_km:distance?Number(distance.replace(",",".")):null})}><Save size={16}/>Salvar cidade/bairro</button></div></div>
}
function Section({icon,title,children}:{icon:React.ReactNode;title:string;children:React.ReactNode}){return <section className="surface p-5"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-basso-cream text-basso-wine">{icon}</span><h2 className="font-display text-xl font-bold">{title}</h2></div><div className="mt-5">{children}</div></section>}
function Grid({children}:{children:React.ReactNode}){return <div className="grid gap-4 sm:grid-cols-2">{children}</div>}
function Field({label,value,onChange}:{label:string;value:string;onChange:(value:string)=>void}){return <label><span className="label">{label}</span><input className="input" value={value} onChange={event=>onChange(event.target.value)}/></label>}
function OptionCard({title,hint,value,onChange}:{title:string;hint:string;value:PizzaOptionItem;onChange:(value:PizzaOptionItem)=>void}){const [price,setPrice]=useState((value.price/100).toFixed(2).replace(".",","));useEffect(()=>{setPrice(current=>parseMoneyInput(current)===value.price?current:(value.price/100).toFixed(2).replace(".",","))},[value.price]);return <div className="rounded-2xl border p-4"><p className="text-sm font-black">{title}</p><p className="text-xs text-black/45">{hint}</p><label className="mt-3 block"><span className="label">Nome</span><input className="input" value={value.name} onChange={e=>onChange({...value,name:e.target.value})}/></label><label className="mt-3 block"><span className="label">Valor extra (R$)</span><input className="input" inputMode="decimal" value={price} onChange={e=>{setPrice(e.target.value);onChange({...value,price:parseMoneyInput(e.target.value)})}} onBlur={()=>setPrice((value.price/100).toFixed(2).replace(".",","))}/></label><label className="mt-3 flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={value.active} onChange={e=>onChange({...value,active:e.target.checked})}/>Disponível para o cliente</label></div>}
function ReadOnly({label,value}:{label:string;value:string}){return <label><span className="label">{label}</span><input className="input bg-black/[.025]" value={value} readOnly/></label>}

