"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { CalendarDays, Edit3, ImagePlus, Loader2, Pause, Play, Plus, Save, Search, Trash2, X } from "lucide-react";
import { PageHeader } from "@/components/internal/PageHeader";
import { apiJson, formatApiError } from "@/lib/client/api";
import { currency } from "@/lib/utils";
import type { Flavor, OrderChannel, Product, PromotionRecord, PromotionRuntimeStatus } from "@/types";

type RuntimeProduct = Product & { stockAvailable?: boolean };
type PromotionTargetAdmin = PromotionRecord["targets"][number] & { originalPrice?: number; originalGrandePrice?: number; originalBrotoPrice?: number };
type PromotionAdmin = Omit<PromotionRecord, "targets"> & { targets: PromotionTargetAdmin[] };

type FormState = {
  name: string;
  description: string;
  badgeText: string;
  promoPrice: string;
  active: boolean;
  paused: boolean;
  channels: OrderChannel[];
  daysOfWeek: number[];
  startsOn: string;
  endsOn: string;
  startTime: string;
  endTime: string;
  pizzaSize: "" | "grande" | "broto";
  allowCouponStack: boolean;
  sortOrder: string;
  productIds: string[];
  flavorIds: string[];
};

const dayOptions = [
  { value: 0, label: "Dom" }, { value: 1, label: "Seg" }, { value: 2, label: "Ter" },
  { value: 3, label: "Qua" }, { value: 4, label: "Qui" }, { value: 5, label: "Sex" }, { value: 6, label: "Sáb" },
];
const channelOptions: Array<{ value: OrderChannel; label: string }> = [
  { value: "own_delivery", label: "Delivery" },
  { value: "pickup", label: "Retirada" },
  { value: "counter", label: "PDV/Balcão" },
  { value: "dine_in", label: "Salão" },
  { value: "table_qr", label: "QR da mesa" },
];
const statusLabels: Record<PromotionRuntimeStatus, string> = {
  active: "Ativa agora", scheduled: "Agendada", paused: "Pausada", inactive: "Inativa", ended: "Encerrada",
};

const emptyForm: FormState = {
  name: "",
  description: "",
  badgeText: "Promoção do dia",
  promoPrice: "",
  active: true,
  paused: false,
  channels: ["own_delivery", "pickup", "counter", "dine_in", "table_qr"],
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  startsOn: "",
  endsOn: "",
  startTime: "",
  endTime: "",
  pizzaSize: "",
  allowCouponStack: false,
  sortOrder: "0",
  productIds: [],
  flavorIds: [],
};

export default function PromotionsPage() {
  const [promotions, setPromotions] = useState<PromotionAdmin[]>([]);
  const [products, setProducts] = useState<RuntimeProduct[]>([]);
  const [flavors, setFlavors] = useState<Flavor[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState(false);
  const [query, setQuery] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [working, setWorking] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const selectableProducts = useMemo(() => products.filter(product => product.active && product.category !== "combo" && (!query || `${product.name} ${product.description}`.toLowerCase().includes(query.toLowerCase()))), [products, query]);
  const selectableFlavors = useMemo(() => flavors.filter(flavor => flavor.active && (!query || `${flavor.name} ${flavor.description}`.toLowerCase().includes(query.toLowerCase()))), [flavors, query]);

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      const [promotionBody, menuBody] = await Promise.all([
        apiJson<{ promotions: PromotionAdmin[] }>("/api/promotions", { cache: "no-store" }),
        apiJson<{ products: RuntimeProduct[]; flavors: Flavor[] }>("/api/menu/availability", { cache: "no-store" }),
      ]);
      setPromotions(promotionBody.promotions || []);
      setProducts(menuBody.products || []);
      setFlavors(menuBody.flavors || []);
    } catch (error) {
      setMessage(formatApiError(error, "Falha ao carregar as promoções."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function startNew() {
    setEditingId(null);
    setForm(emptyForm);
    setImageFile(null);
    setQuery("");
    setOpenForm(true);
    setMessage("");
  }

  function startEdit(promotion: PromotionAdmin) {
    setEditingId(promotion.id);
    setForm({
      name: promotion.name,
      description: promotion.description,
      badgeText: promotion.badgeText,
      promoPrice: String((promotion.promoPrice / 100).toFixed(2)).replace(".", ","),
      active: promotion.active,
      paused: promotion.paused,
      channels: promotion.channels,
      daysOfWeek: promotion.daysOfWeek,
      startsOn: promotion.startsOn || "",
      endsOn: promotion.endsOn || "",
      startTime: promotion.startTime || "",
      endTime: promotion.endTime || "",
      pizzaSize: promotion.pizzaSize || "",
      allowCouponStack: promotion.allowCouponStack,
      sortOrder: String(promotion.sortOrder || 0),
      productIds: promotion.targets.flatMap(target => target.productId ? [target.productId] : []),
      flavorIds: promotion.targets.flatMap(target => target.flavorId ? [target.flavorId] : []),
    });
    setImageFile(null);
    setQuery("");
    setOpenForm(true);
    setMessage("");
  }

  function toggleDay(day: number) {
    setForm(current => ({ ...current, daysOfWeek: current.daysOfWeek.includes(day) ? current.daysOfWeek.filter(value => value !== day) : [...current.daysOfWeek, day].sort() }));
  }

  function toggleChannel(channel: OrderChannel) {
    setForm(current => ({ ...current, channels: current.channels.includes(channel) ? current.channels.filter(value => value !== channel) : [...current.channels, channel] }));
  }

  function toggleProduct(id: string) {
    setForm(current => ({ ...current, productIds: current.productIds.includes(id) ? current.productIds.filter(value => value !== id) : [...current.productIds, id] }));
  }

  function toggleFlavor(id: string) {
    setForm(current => ({ ...current, flavorIds: current.flavorIds.includes(id) ? current.flavorIds.filter(value => value !== id) : [...current.flavorIds, id] }));
  }

  async function uploadImage(id: string, file: File) {
    const body = new FormData();
    body.append("file", file);
    const response = await fetch(`/api/promotions/${id}/image`, { method: "POST", body });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error || "Falha ao enviar imagem da promoção.");
  }

  async function save() {
    const promoPrice = Math.round((Number(form.promoPrice.replace(",", ".")) || 0) * 100);
    if (!form.name.trim()) { setMessage("Informe o nome da promoção."); return; }
    if (promoPrice <= 0) { setMessage("Informe um preço promocional maior que zero."); return; }
    if (!form.daysOfWeek.length) { setMessage("Selecione pelo menos um dia da semana."); return; }
    if (!form.channels.length) { setMessage("Selecione pelo menos um canal."); return; }
    if (!form.productIds.length && !form.flavorIds.length) { setMessage("Selecione pelo menos um produto ou sabor."); return; }

    setWorking("save"); setMessage("");
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        badgeText: form.badgeText.trim() || "Promoção do dia",
        promoPrice,
        active: form.active,
        paused: form.paused,
        channels: form.channels,
        daysOfWeek: form.daysOfWeek,
        startsOn: form.startsOn || null,
        endsOn: form.endsOn || null,
        startTime: form.startTime || null,
        endTime: form.endTime || null,
        pizzaSize: form.pizzaSize || null,
        allowCouponStack: form.allowCouponStack,
        sortOrder: Number(form.sortOrder) || 0,
        productIds: form.productIds,
        flavorIds: form.flavorIds,
      };
      const result = editingId
        ? await apiJson<{ promotion: PromotionAdmin }>(`/api/promotions/${editingId}`, { method: "PATCH", body: JSON.stringify(payload) })
        : await apiJson<{ promotion: PromotionAdmin }>("/api/promotions", { method: "POST", body: JSON.stringify(payload) });
      const id = editingId || result.promotion.id;
      if (imageFile) await uploadImage(id, imageFile);
      setOpenForm(false);
      setEditingId(null);
      setImageFile(null);
      setMessage(editingId ? "Promoção atualizada." : "Promoção criada.");
      await load();
    } catch (error) {
      setMessage(formatApiError(error, "Falha ao salvar promoção."));
    } finally {
      setWorking("");
    }
  }

  async function togglePause(promotion: PromotionAdmin) {
    setWorking(`pause-${promotion.id}`); setMessage("");
    try {
      await apiJson(`/api/promotions/${promotion.id}`, { method: "PATCH", body: JSON.stringify({ paused: !promotion.paused }) });
      setMessage(promotion.paused ? "Promoção retomada e novamente sujeita à agenda." : "Promoção pausada imediatamente.");
      await load();
    } catch (error) { setMessage(formatApiError(error, "Falha ao alterar o estado da promoção.")); }
    finally { setWorking(""); }
  }

  async function removePromotion(promotion: PromotionAdmin) {
    if (!window.confirm(`Excluir a promoção “${promotion.name}”? O histórico de auditoria será preservado.`)) return;
    setWorking(`delete-${promotion.id}`); setMessage("");
    try {
      await apiJson(`/api/promotions/${promotion.id}`, { method: "DELETE" });
      setMessage("Promoção excluída.");
      await load();
    } catch (error) { setMessage(formatApiError(error, "Falha ao excluir promoção.")); }
    finally { setWorking(""); }
  }

  async function replaceImage(promotion: PromotionAdmin, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setWorking(`image-${promotion.id}`); setMessage("");
    try {
      await uploadImage(promotion.id, file);
      setMessage("Imagem da promoção atualizada.");
      await load();
    } catch (error) { setMessage(formatApiError(error, "Falha ao atualizar imagem.")); }
    finally { setWorking(""); event.target.value = ""; }
  }

  return <>
    <PageHeader title="Promoções do dia" icon={CalendarDays} description="Crie preços promocionais que entram e saem automaticamente conforme dia, período e horário. Pausar interrompe a promoção imediatamente." actions={<button className="btn-primary" onClick={startNew}><Plus size={17}/>Nova promoção</button>} />

    {message && <div className={`mb-4 rounded-2xl border p-4 text-sm font-semibold ${/falha|informe|selecione|erro/i.test(message) ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{message}</div>}

    {loading ? <div className="surface grid min-h-52 place-items-center"><Loader2 className="animate-spin text-basso-wine" size={34}/></div> : <div className="grid gap-4 xl:grid-cols-2">{promotions.map(promotion => <article key={promotion.id} className="surface overflow-hidden">
      <div className="flex gap-4 p-5">
        <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-2xl bg-basso-cream text-basso-wine">{promotion.image ? <img src={promotion.image} alt="" className="h-full w-full object-cover"/> : <ImagePlus size={25}/>}</div>
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${promotion.status === "active" ? "bg-emerald-50 text-emerald-700" : promotion.status === "paused" ? "bg-amber-50 text-amber-800" : promotion.status === "ended" ? "bg-black/5 text-black/45" : "bg-blue-50 text-blue-700"}`}>{statusLabels[promotion.status || "scheduled"]}</span><span className="rounded-full bg-basso-wine/10 px-2.5 py-1 text-[10px] font-black text-basso-wine">{promotion.badgeText}</span></div><h2 className="mt-2 font-display text-2xl font-black">{promotion.name}</h2><p className="mt-1 line-clamp-2 text-sm text-black/50">{promotion.description || "Sem descrição."}</p><p className="mt-3 font-display text-2xl font-black text-basso-wine">{currency(promotion.promoPrice)}</p></div>
      </div>
      <div className="border-t px-5 py-4 text-xs text-black/55"><p><strong>Dias:</strong> {dayOptions.filter(day => promotion.daysOfWeek.includes(day.value)).map(day => day.label).join(", ")}</p><p className="mt-1"><strong>Período:</strong> {promotion.startsOn || "sem início"} → {promotion.endsOn || "sem fim"}{promotion.startTime || promotion.endTime ? ` • ${promotion.startTime || "00:00"}–${promotion.endTime || "23:59"}` : ""}</p><p className="mt-1"><strong>Alvos:</strong> {promotion.targets.map(target => target.label).filter(Boolean).join(", ") || "—"}</p><p className="mt-1"><strong>Cupom:</strong> {promotion.allowCouponStack ? "pode acumular" : "não acumula"}</p></div>
      <div className="grid grid-cols-2 gap-2 border-t p-4 sm:grid-cols-4"><button className="btn-secondary" onClick={() => startEdit(promotion)}><Edit3 size={15}/>Editar</button><button className="btn-secondary" disabled={working === `pause-${promotion.id}`} onClick={() => void togglePause(promotion)}>{promotion.paused ? <Play size={15}/> : <Pause size={15}/>} {promotion.paused ? "Retomar" : "Pausar"}</button><label className="btn-secondary cursor-pointer"><ImagePlus size={15}/>{working === `image-${promotion.id}` ? "Enviando" : "Imagem"}<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="hidden" onChange={event => void replaceImage(promotion, event)}/></label><button className="btn-secondary text-red-700" disabled={working === `delete-${promotion.id}`} onClick={() => void removePromotion(promotion)}><Trash2 size={15}/>Excluir</button></div>
    </article>)}{!promotions.length && <div className="surface p-10 text-center xl:col-span-2"><CalendarDays className="mx-auto text-black/20" size={40}/><h2 className="mt-3 font-display text-xl font-bold">Nenhuma promoção cadastrada</h2><p className="mt-1 text-sm text-black/45">Crie a primeira promoção e escolha os dias em que ela deve aparecer automaticamente.</p><button className="btn-primary mt-5" onClick={startNew}><Plus size={17}/>Criar promoção</button></div>}</div>}

    {openForm && <div className="fixed inset-0 z-[120] overflow-y-auto bg-black/55 p-3 backdrop-blur-sm sm:p-6"><div className="mx-auto max-w-4xl rounded-3xl bg-[#f7f4ed] shadow-2xl"><div className="sticky top-0 z-10 flex items-center gap-3 rounded-t-3xl border-b bg-white p-5"><div className="min-w-0 flex-1"><p className="text-xs font-black uppercase tracking-[.14em] text-basso-wine">Controle total</p><h2 className="font-display text-2xl font-black">{editingId ? "Editar promoção" : "Nova promoção"}</h2></div><button className="btn-ghost" onClick={() => setOpenForm(false)}><X size={21}/></button></div>
      <div className="grid gap-6 p-5 sm:p-6">
        <section className="surface p-5"><h3 className="font-display text-xl font-bold">Informações</h3><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="sm:col-span-2"><span className="label">Nome</span><input className="input" value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} placeholder="Ex.: Terça da Pizza"/></label><label className="sm:col-span-2"><span className="label">Descrição</span><textarea className="textarea" value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} placeholder="Texto que o cliente verá na promoção."/></label><label><span className="label">Selo</span><input className="input" value={form.badgeText} onChange={event => setForm(current => ({ ...current, badgeText: event.target.value }))}/></label><label><span className="label">Preço promocional</span><input className="input" value={form.promoPrice} inputMode="decimal" onChange={event => setForm(current => ({ ...current, promoPrice: event.target.value }))} placeholder="59,90"/></label><label><span className="label">Tamanho da pizza (opcional)</span><select className="input" value={form.pizzaSize} onChange={event => setForm(current => ({ ...current, pizzaSize: event.target.value as FormState["pizzaSize"] }))}><option value="">Todos os tamanhos elegíveis</option><option value="grande">Somente Grande</option><option value="broto">Somente Broto</option></select></label><label><span className="label">Ordem</span><input className="input" type="number" value={form.sortOrder} onChange={event => setForm(current => ({ ...current, sortOrder: event.target.value }))}/></label><label className="sm:col-span-2"><span className="label">Imagem {editingId ? "(troque também pelo card após salvar)" : ""}</span><input className="input p-2" type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={event => setImageFile(event.target.files?.[0] || null)}/></label></div></section>

        <section className="surface p-5"><h3 className="font-display text-xl font-bold">Agenda automática</h3><div className="mt-4"><span className="label">Dias da semana</span><div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-7">{dayOptions.map(day => <button type="button" key={day.value} onClick={() => toggleDay(day.value)} className={`min-h-11 rounded-xl border text-sm font-bold ${form.daysOfWeek.includes(day.value) ? "border-basso-wine bg-basso-wine text-white" : "border-black/10 bg-white"}`}>{day.label}</button>)}</div></div><div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><label><span className="label">Data inicial</span><input className="input" type="date" value={form.startsOn} onChange={event => setForm(current => ({ ...current, startsOn: event.target.value }))}/></label><label><span className="label">Data final</span><input className="input" type="date" value={form.endsOn} onChange={event => setForm(current => ({ ...current, endsOn: event.target.value }))}/></label><label><span className="label">Hora inicial</span><input className="input" type="time" value={form.startTime} onChange={event => setForm(current => ({ ...current, startTime: event.target.value }))}/></label><label><span className="label">Hora final</span><input className="input" type="time" value={form.endTime} onChange={event => setForm(current => ({ ...current, endTime: event.target.value }))}/></label></div><p className="mt-3 text-xs text-black/45">Sem datas ou horários, a promoção usa somente os dias escolhidos. A validação acontece no servidor no horário de São Paulo.</p></section>

        <section className="surface p-5"><h3 className="font-display text-xl font-bold">Onde vale</h3><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">{channelOptions.map(channel => <button type="button" key={channel.value} onClick={() => toggleChannel(channel.value)} className={`min-h-11 rounded-xl border px-2 text-xs font-bold ${form.channels.includes(channel.value) ? "border-basso-wine bg-basso-wine text-white" : "border-black/10 bg-white"}`}>{channel.label}</button>)}</div></section>

        <section className="surface p-5"><div className="flex flex-wrap items-end gap-3"><div className="min-w-0 flex-1"><h3 className="font-display text-xl font-bold">Produtos e sabores</h3><p className="mt-1 text-xs text-black/45">Para pizza meio a meio, todos os sabores escolhidos pelo cliente precisam estar permitidos na promoção.</p></div><label className="relative min-w-60"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30" size={16}/><input className="input pl-9" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar item"/></label></div><div className="mt-4 grid gap-4 lg:grid-cols-2"><div><p className="label">Sabores de pizza • {form.flavorIds.length} selecionado(s)</p><div className="mt-2 max-h-64 divide-y overflow-y-auto rounded-2xl border bg-white">{selectableFlavors.map(flavor => <label key={flavor.id} className="flex cursor-pointer items-start gap-3 p-3 hover:bg-basso-paper"><input type="checkbox" className="mt-1" checked={form.flavorIds.includes(flavor.id)} onChange={() => toggleFlavor(flavor.id)}/><span className="min-w-0 flex-1"><strong className="text-sm">{flavor.name}</strong><span className="block text-xs text-black/40">Grande {currency(flavor.priceGrande)} • Broto {currency(flavor.priceBroto)}</span></span></label>)}</div></div><div><p className="label">Produtos • {form.productIds.length} selecionado(s)</p><div className="mt-2 max-h-64 divide-y overflow-y-auto rounded-2xl border bg-white">{selectableProducts.map(product => <label key={product.id} className="flex cursor-pointer items-start gap-3 p-3 hover:bg-basso-paper"><input type="checkbox" className="mt-1" checked={form.productIds.includes(product.id)} onChange={() => toggleProduct(product.id)}/><span className="min-w-0 flex-1"><strong className="text-sm">{product.name}</strong><span className="block text-xs text-black/40">{currency(product.price)}</span></span></label>)}</div></div></div></section>

        <section className="surface p-5"><div className="grid gap-3 sm:grid-cols-3"><label className="flex items-start gap-3 rounded-2xl border p-4"><input type="checkbox" className="mt-1" checked={form.active} onChange={event => setForm(current => ({ ...current, active: event.target.checked }))}/><span><strong className="text-sm">Promoção habilitada</strong><span className="mt-1 block text-xs text-black/45">Se desligada, nunca entra no cardápio.</span></span></label><label className="flex items-start gap-3 rounded-2xl border p-4"><input type="checkbox" className="mt-1" checked={form.paused} onChange={event => setForm(current => ({ ...current, paused: event.target.checked }))}/><span><strong className="text-sm">Pausada agora</strong><span className="mt-1 block text-xs text-black/45">Ignora a agenda até ser retomada.</span></span></label><label className="flex items-start gap-3 rounded-2xl border p-4"><input type="checkbox" className="mt-1" checked={form.allowCouponStack} onChange={event => setForm(current => ({ ...current, allowCouponStack: event.target.checked }))}/><span><strong className="text-sm">Permitir cupom junto</strong><span className="mt-1 block text-xs text-black/45">Desligado é o padrão mais seguro.</span></span></label></div></section>
      </div>
      <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 rounded-b-3xl border-t bg-white p-4"><button className="btn-secondary" onClick={() => setOpenForm(false)}><X size={16}/>Cancelar</button><button className="btn-primary" disabled={working === "save"} onClick={() => void save()}>{working === "save" ? <Loader2 size={17} className="animate-spin"/> : <Save size={17}/>}Salvar promoção</button></div>
    </div></div>}
  </>;
}
