"use client";

import { FormEvent, useEffect, useState } from "react";
import { Building2, CreditCard, Edit3, MapPin, PauseCircle, PlayCircle, Plus, Save, Settings, Trash2, Truck, Users, X } from "lucide-react";
import { PageHeader } from "@/components/internal/PageHeader";
import { currency, isDemoMode, uid } from "@/lib/utils";

type FormState = {
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
};
type Zone = { id: string; name: string; city: string; districts: string[]; fee_cents: number; minimum_order_cents: number; max_distance_km: number | null; active: boolean };
const DEMO_KEY = "lfb-settings-v31";
const defaults: FormState = { minimumOrder: "0", maximumDeliveryKm: "", pixKey: "", pixKeyType: "cpf_cnpj", pixConfirmation: "manual", serviceFeePercent: "0", waiterCommissionPercent: "0", schedulingEnabled: true, fiscalMode: "non_fiscal", preparationCapacityPerSlot: "" };

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
              minimumOrder: String((body.settings?.minimum_order_cents || 0) / 100),
              maximumDeliveryKm: config.maximumDeliveryKm == null ? "" : String(config.maximumDeliveryKm),
              pixKey: config.pixKey || "", pixKeyType: config.pixKeyType || "cpf_cnpj",
              pixConfirmation: config.pixConfirmation || "manual",
              serviceFeePercent: String(config.serviceFeePercent || 0), waiterCommissionPercent: String(config.waiterCommissionPercent || 0),
              schedulingEnabled: config.schedulingEnabled !== false, fiscalMode: config.fiscalMode || "non_fiscal",
              preparationCapacityPerSlot: config.preparationCapacityPerSlot == null ? "" : String(config.preparationCapacityPerSlot)
            });
            setZones((body.deliveryZones || []).map((zone: Zone) => ({ ...zone, city: zone.city || zone.name.split(" — ")[0] || "" })));
          }
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
        const response = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ minimumOrder: numberValue(form.minimumOrder, 100), config: { pixKey: form.pixKey || null, pixKeyType: form.pixKeyType || null, pixConfirmation: form.pixConfirmation, serviceFeePercent: numberValue(form.serviceFeePercent), waiterCommissionPercent: numberValue(form.waiterCommissionPercent), schedulingEnabled: form.schedulingEnabled, maximumDeliveryKm: form.maximumDeliveryKm ? Number(form.maximumDeliveryKm.replace(",", ".")) : null, fiscalMode: form.fiscalMode, preparationCapacityPerSlot: form.preparationCapacityPerSlot ? Number(form.preparationCapacityPerSlot) : null } }) });
        const body = await response.json(); if (!response.ok) throw new Error(body.error || "Falha ao salvar.");
      }
      setMessage("Configurações salvas e registradas na auditoria.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao salvar."); }
    finally { setSaving(false); }
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
      <Section icon={<Building2/>} title="Estabelecimento"><Grid><ReadOnly label="Nome fantasia" value="La Forneria Basso"/><ReadOnly label="CNPJ" value="62.332.415/0001-10"/><ReadOnly label="Telefone" value="(11) 97235-6751"/><ReadOnly label="Funcionamento" value="Terça a domingo, 18h às 23h"/></Grid></Section>
      <Section icon={<Truck/>} title="Delivery"><Grid><Field label="Pedido mínimo geral (R$)" value={form.minimumOrder} onChange={value=>setForm({...form,minimumOrder:value})}/><Field label="Área máxima (km)" value={form.maximumDeliveryKm} onChange={value=>setForm({...form,maximumDeliveryKm:value})}/><Field label="Capacidade por faixa" value={form.preparationCapacityPerSlot} onChange={value=>setForm({...form,preparationCapacityPerSlot:value})}/><label className="flex items-end gap-3 rounded-xl border p-3"><input type="checkbox" checked={form.schedulingEnabled} onChange={event=>setForm({...form,schedulingEnabled:event.target.checked})}/><span className="text-sm font-bold">Agendamento habilitado</span></label></Grid><button className="btn-secondary mt-4" onClick={()=>setShowZone(value=>!value)}><MapPin size={16}/>{showZone ? "Fechar cadastro" : "Adicionar cidade/bairro"}</button></Section>
      <Section icon={<CreditCard/>} title="Pagamentos"><Grid><Field label="Chave Pix" value={form.pixKey} onChange={value=>setForm({...form,pixKey:value})}/><label><span className="label">Conferência Pix</span><select className="input" value={form.pixConfirmation} onChange={event=>setForm({...form,pixConfirmation:event.target.value as FormState["pixConfirmation"]})}><option value="manual">Manual</option><option value="automatic">Automática (somente com gateway homologado)</option></select></label><ReadOnly label="Integração Rede" value="Aguardando SDK/App2App e homologação da Laranjinha"/><label><span className="label">Modo fiscal</span><select className="input" value={form.fiscalMode} onChange={event=>setForm({...form,fiscalMode:event.target.value as FormState["fiscalMode"]})}><option value="non_fiscal">Comprovante não fiscal</option><option value="nfce">NFC-e</option><option value="external">Integração fiscal externa</option></select></label></Grid></Section>
      <Section icon={<Users/>} title="Salão e permissões"><Grid><ReadOnly label="Mesas" value="15 (10×5 + 5×2 lugares)"/><Field label="Taxa de serviço (%)" value={form.serviceFeePercent} onChange={value=>setForm({...form,serviceFeePercent:value})}/><Field label="Comissão garçom (%)" value={form.waiterCommissionPercent} onChange={value=>setForm({...form,waiterCommissionPercent:value})}/><ReadOnly label="Junção de mesas" value="Permitida com auditoria"/></Grid></Section>
    </div>

    {showZone && <form onSubmit={addZone} className="surface mt-6 p-5"><h2 className="font-display text-xl font-bold">Nova cidade/bairro de entrega</h2><p className="mt-1 text-sm text-black/45">A cidade é usada no checkout; você pode agrupar bairros da mesma cidade quando a taxa for igual.</p><div className="mt-4 grid gap-4 md:grid-cols-5"><Field label="Cidade" value={zoneCity} onChange={setZoneCity}/><Field label="Nome da zona (opcional)" value={zoneName} onChange={setZoneName}/><Field label="Bairros (separados por vírgula)" value={districts} onChange={setDistricts}/><Field label="Taxa (R$)" value={zoneFee} onChange={setZoneFee}/><Field label="Pedido mínimo (R$)" value={zoneMinimum} onChange={setZoneMinimum}/></div><button type="submit" className="btn-primary mt-4" disabled={saving}><Plus size={16}/>Adicionar zona</button></form>}

    <section className="surface mt-6 overflow-hidden"><div className="border-b p-5"><h2 className="font-display text-xl font-bold">Cidades, bairros e taxas cadastrados</h2><p className="mt-1 text-sm text-black/45">Editar altera os próximos pedidos; pausar é reversível; remover arquiva sem apagar o histórico.</p></div><div className="divide-y">{zones.map(zone=><div key={zone.id} className="flex flex-wrap items-center gap-4 p-4"><div className="min-w-0 flex-1"><strong>{zone.name}</strong><p className="text-xs font-semibold text-basso-wine">{zone.city}</p><p className="text-xs text-black/45">{zone.districts.join(", ")}</p></div><span className="text-sm font-bold">{currency(zone.fee_cents)}</span><span className="text-xs text-black/45">mín. {currency(zone.minimum_order_cents)}</span><span className={`rounded-full px-2 py-1 text-xs font-bold ${zone.active?"bg-emerald-50 text-emerald-700":"bg-amber-50 text-amber-700"}`}>{zone.active?"Ativa":"Pausada"}</span><button className="btn-ghost" onClick={()=>setEditingZone(zone)}><Edit3 size={16}/>Editar</button><button className="btn-ghost" disabled={saving} onClick={()=>void updateZone(zone,{active:!zone.active})}>{zone.active?<><PauseCircle size={16}/>Pausar</>:<><PlayCircle size={16}/>Reativar</>}</button><button className="btn-ghost text-red-700" disabled={saving} onClick={()=>void archiveZone(zone)}><Trash2 size={16}/>Remover</button></div>)}{!zones.length&&<p className="p-6 text-sm text-black/45">Nenhum bairro/taxa cadastrado. Enquanto isso, pedidos de entrega permanecem bloqueados com segurança.</p>}</div></section>
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
function ReadOnly({label,value}:{label:string;value:string}){return <label><span className="label">{label}</span><input className="input bg-black/[.025]" value={value} readOnly/></label>}
