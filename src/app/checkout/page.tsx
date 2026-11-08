"use client";

import Image from "next/image";
import { isTableNumber } from "@/lib/tables";
import Link from "next/link";
import { ArrowLeft, Crosshair, Loader2, LockKeyhole, ShoppingBag } from "lucide-react";
import dynamic from "next/dynamic";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useCart } from "@/context/CartContext";
import { useDemoState, demoActions } from "@/lib/demo-store";
import { checkoutSchema } from "@/lib/order-validation";
import { currency, isDemoMode, normalizePhone, uid } from "@/lib/utils";
import { normalizeCityName, normalizeDistrictName } from "@/lib/delivery-zones";
import { paymentMethodLabels, publicPaymentMethods } from "@/lib/payment-methods";
import type { Address, Order, OrderChannel, PaymentMethod } from "@/types";
import { customerDeviceActions } from "@/lib/customer-device-store";
import { PixPaymentCard } from "@/components/public/PixPaymentCard";
import { useStoreAvailability } from "@/components/public/useStoreAvailability";

const LocationPicker = dynamic(() => import("@/components/maps/LocationPicker").then(module => module.LocationPicker), { ssr: false });
const emptyAddress: Address = { cep: "", street: "", number: "", district: "", complement: "", reference: "", city: "", state: "SP" };
const tableTabKey = (table: number) => `lfb-table-tab-v31-${table}`;
const tableNameKey = (table: number) => `lfb-table-name-v31-${table}`;
const PROFILE_KEY = "lfb-checkout-profile-v1";
type SavedProfile = { name?: string; phone?: string; address?: Partial<Address> };
const formatCep = (value: string) => { const digits = value.replace(/\D/g, "").slice(0, 8); return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits; };
type ViaCepResponse = { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };

type CheckoutQuote = {
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
  couponCode?: string;
  coverageConfigurationPending?: boolean;
};
type ReverseAddressResponse = Partial<Address> & { displayName?: string; error?: string };
type DeliveryDistrict = { name: string; aliases: string[]; fee: number; minimumOrder: number };
type DeliveryCity = { name: string; districts: DeliveryDistrict[] };
type DeliveryAreasResponse = { cities?: DeliveryCity[]; error?: string };

export default function CheckoutPage() {
  const cart = useCart();
  const [confirmed,setConfirmed]=useState<{id:string;number:number;token?:string;payment?:PaymentMethod;total?:number}|null>(null);
  const coupons = useDemoState(s => s.coupons);
  const orders = useDemoState(s => s.orders);
  const tables = useDemoState(s => s.tables);
  const [channel, setChannel] = useState<OrderChannel>("own_delivery");
  const [tableNumber, setTableNumber] = useState<number | null>(null);
  const [tableTabId, setTableTabId] = useState<string | undefined>();
  const [tabName, setTabName] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState<Address>(emptyAddress);
  const [payment, setPayment] = useState<PaymentMethod>("pix");
  const [needsChange, setNeedsChange] = useState(false);
  const [changeFor, setChangeFor] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");
  const [serverQuote, setServerQuote] = useState<CheckoutQuote | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const [quoting, setQuoting] = useState(false);
  const [deliveryCities, setDeliveryCities] = useState<DeliveryCity[]>([]);
  const [areasLoading, setAreasLoading] = useState(true);
  const [areasError, setAreasError] = useState("");
  const checkoutKeyRef = useRef(uid("checkout"));
  const [cepStatus, setCepStatus] = useState("");
  const store = useStoreAvailability();
  const lastCepRef = useRef("");

  // Recupera nome, telefone e endereço do último pedido feito neste aparelho.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("mesa")) return;
    try {
      const saved = JSON.parse(localStorage.getItem(PROFILE_KEY) || "null") as SavedProfile | null;
      if (!saved) return;
      if (saved.name) setName(saved.name);
      if (saved.phone) setPhone(saved.phone);
      if (saved.address) { setAddress(current => ({ ...current, ...saved.address, latitude: undefined, longitude: undefined })); lastCepRef.current = (saved.address.cep || "").replace(/\D/g, ""); }
    } catch { /* armazenamento indisponível */ }
  }, []);

  useEffect(() => {
    const table = Number(new URLSearchParams(window.location.search).get("mesa"));
    if (!isTableNumber(table)) return;
    setTableNumber(table);
    setChannel("table_qr");
    const storedTab = localStorage.getItem(tableTabKey(table)) || undefined;
    const storedName = localStorage.getItem(tableNameKey(table)) || "";
    setTableTabId(storedTab); setTabName(storedName); setName(storedName);
  }, []);

  useEffect(() => {
    if (payment !== "cash") { setNeedsChange(false); setChangeFor(""); }
  }, [payment]);

  async function fetchDeliveryCities(): Promise<DeliveryCity[]> {
    if (deliveryCities.length) return deliveryCities;
    const response = await fetch("/api/delivery/areas", { cache: "no-store" });
    const body = await response.json().catch(() => null) as DeliveryAreasResponse | null;
    if (!response.ok || !body) throw new Error(body?.error || "Não foi possível carregar as cidades atendidas.");
    const cities = body.cities || [];
    setDeliveryCities(cities);
    return cities;
  }

  useEffect(() => {
    let cancelled = false;
    async function loadAreas() {
      setAreasLoading(true); setAreasError("");
      try {
        const response = await fetch("/api/delivery/areas", { cache: "no-store" });
        const body = await response.json().catch(() => null) as DeliveryAreasResponse | null;
        if (!response.ok || !body) throw new Error(body?.error || "Não foi possível carregar a área de entrega.");
        if (!cancelled) setDeliveryCities(body.cities || []);
      } catch (failure) {
        if (!cancelled) setAreasError(failure instanceof Error ? failure.message : "Não foi possível carregar a área de entrega.");
      } finally { if (!cancelled) setAreasLoading(false); }
    }
    void loadAreas();
    return () => { cancelled = true; };
  }, []);

  const isTableOrder = channel === "table_qr";
  const deliveryUnavailable = !areasLoading && !areasError && deliveryCities.length === 0;
  useEffect(() => { if (deliveryUnavailable && channel === "own_delivery") setChannel("pickup"); }, [deliveryUnavailable, channel]);
  const backHref = tableNumber ? `/?mesa=${tableNumber}` : "/";
  const selectedCity = useMemo(() => deliveryCities.find(city => normalizeCityName(city.name) === normalizeCityName(address.city || "")), [deliveryCities, address.city]);
  const selectedDistrict = useMemo(() => selectedCity?.districts.find(district => district.aliases.some(alias => normalizeDistrictName(alias) === normalizeDistrictName(address.district || ""))), [selectedCity, address.district]);
  const coupon = useMemo(() => coupons.find(c => c.active && c.code.toUpperCase() === couponCode.trim().toUpperCase() && (c.totalLimit == null || c.uses < c.totalLimit) && c.channels.includes(channel)), [coupons, couponCode, channel]);
  const localDiscount = useMemo(() => {
    if (!coupon || (coupon.minimum && cart.subtotal < coupon.minimum)) return 0;
    return coupon.type === "percentage" ? Math.round(cart.subtotal * coupon.value / 100) : Math.min(coupon.value, cart.subtotal);
  }, [coupon, cart.subtotal]);
  const displaySubtotal = !isDemoMode() && serverQuote ? serverQuote.subtotal : cart.subtotal;
  const displayDiscount = !isDemoMode() && serverQuote ? serverQuote.discount : localDiscount;
  const displayDeliveryFee = !isDemoMode() && serverQuote ? serverQuote.deliveryFee : 0;
  const total = !isDemoMode() && serverQuote ? serverQuote.total : Math.max(0, cart.subtotal - localDiscount);
  const promotionSavings = Math.max(0, cart.subtotal - displaySubtotal);
  const blockReason = !store.open ? store.message : channel !== "own_delivery" ? "" : !selectedCity ? "Selecione a cidade de entrega para continuar." : !selectedDistrict ? "Selecione o bairro de entrega para continuar." : !isDemoMode() && !serverQuote ? "Calculando a taxa de entrega..." : "";
  const changeForCents = payment === "cash" && needsChange ? Math.round((Number(changeFor.replace(",", ".")) || 0) * 100) : 0;
  const changeDue = payment === "cash" && needsChange && changeForCents >= total ? changeForCents - total : null;

  useEffect(() => {
    if (isDemoMode() || !cart.items.length) return;
    if (channel === "own_delivery" && (!address.city.trim() || !address.district.trim())) { setServerQuote(null); setQuoteError(""); return; }
    setServerQuote(null);
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setQuoting(true); setQuoteError("");
      try {
        const response = await fetch("/api/quote", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: cart.items, channel, couponCode: couponCode.trim() || undefined, city: channel === "own_delivery" ? address.city.trim() : undefined, district: channel === "own_delivery" ? address.district.trim() : undefined }),
        });
        const body = await response.json().catch(() => null) as CheckoutQuote & { error?: string } | null;
        if (!response.ok) throw new Error(body?.error || "Não foi possível atualizar o total.");
        if (!cancelled && body) setServerQuote(body);
      } catch (failure) {
        if (!cancelled) { setServerQuote(null); setQuoteError(failure instanceof Error ? failure.message : "Não foi possível atualizar o total."); }
      } finally { if (!cancelled) setQuoting(false); }
    }, 350);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [address.city, address.district, cart.items, channel, couponCode]);

  function matchCoverage(cities: DeliveryCity[], detectedCity?: string, detectedDistrict?: string) {
    const city = cities.find(candidate => normalizeCityName(candidate.name) === normalizeCityName(detectedCity || ""));
    if (!city) return { city: undefined, district: undefined };
    const district = city.districts.find(candidate => candidate.aliases.some(alias => normalizeDistrictName(alias) === normalizeDistrictName(detectedDistrict || "")));
    return { city, district };
  }

  async function fillAddressFromCoordinates(latitude: number, longitude: number) {
    setAddress(current => ({ ...current, latitude, longitude }));
    const [response, cities] = await Promise.all([
      fetch("/api/geocode/reverse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ latitude, longitude }) }),
      fetchDeliveryCities(),
    ]);
    const body = await response.json().catch(() => null) as ReverseAddressResponse | null;
    if (!response.ok || !body) throw new Error(body?.error || "Não foi possível identificar o endereço desta localização.");
    const coverage = matchCoverage(cities, body.city, body.district);
    setAddress(current => ({ ...current, cep: body.cep || current.cep, street: body.street || current.street, number: body.number || current.number, city: coverage.city?.name || "", district: coverage.district?.name || "", state: body.state || current.state || "SP", latitude, longitude }));
    if (!coverage.city) setLocationMessage(`Localização encontrada${body.city ? ` em ${body.city}` : ""}, mas a cidade não foi reconhecida na área atendida. Selecione a cidade manualmente.`);
    else if (!coverage.district) setLocationMessage(`Cidade identificada: ${coverage.city.name}. A rua e o CEP foram preenchidos; escolha o bairro atendido.`);
    else setLocationMessage(`Localização identificada em ${coverage.district.name}, ${coverage.city.name}. Confira o número e o complemento.`);
  }

  const useLocation = () => {
    if (!navigator.geolocation) { setError("Geolocalização não está disponível neste aparelho."); return; }
    setLocating(true); setError(""); setLocationMessage("");
    navigator.geolocation.getCurrentPosition(async pos => {
      try { await fillAddressFromCoordinates(pos.coords.latitude, pos.coords.longitude); }
      catch (locationError) { setAddress(current => ({ ...current, latitude: pos.coords.latitude, longitude: pos.coords.longitude })); setError(locationError instanceof Error ? `${locationError.message} Complete o endereço manualmente.` : "Localização encontrada, mas o endereço não pôde ser preenchido."); }
      finally { setLocating(false); }
    }, () => { setError("Não foi possível obter sua localização. Confirme a permissão do navegador."); setLocating(false); }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30_000 });
  };

  const adjustLocation = async (latitude: number, longitude: number) => {
    setError(""); setLocationMessage("Atualizando endereço a partir do novo ponto...");
    try { await fillAddressFromCoordinates(latitude, longitude); }
    catch (failure) { setAddress(current => ({ ...current, latitude, longitude })); setLocationMessage(""); setError(failure instanceof Error ? failure.message : "Não foi possível atualizar o endereço pelo mapa."); }
  };

  const lookupCep = async (digits: string) => {
    setCepStatus("Buscando endereço pelo CEP...");
    try {
      const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const body = await response.json() as ViaCepResponse;
      if (!response.ok || body.erro) throw new Error("not-found");
      const cities = await fetchDeliveryCities().catch(() => deliveryCities);
      const coverage = matchCoverage(cities, body.localidade, body.bairro);
      setAddress(current => ({ ...current, street: body.logradouro || current.street, city: coverage.city?.name || "", district: coverage.district?.name || "", state: body.uf || current.state }));
      if (!coverage.city) setCepStatus(`Este CEP é de ${body.localidade || "outra cidade"}, fora da área de entrega cadastrada.`);
      else if (!coverage.district) setCepStatus(`Rua encontrada em ${coverage.city.name}. Selecione o bairro atendido.`);
      else setCepStatus(`Endereço encontrado em ${coverage.district.name}. Agora informe o número.`);
    } catch {
      setCepStatus("Não encontramos este CEP. Preencha o endereço manualmente.");
    }
  };
  const changeCep = (value: string) => {
    const formatted = formatCep(value);
    setAddress(current => ({ ...current, cep: formatted }));
    const digits = formatted.replace(/\D/g, "");
    if (digits.length === 8 && digits !== lastCepRef.current) { lastCepRef.current = digits; void lookupCep(digits); }
    if (digits.length < 8) setCepStatus("");
  };

  const chooseCity = (cityName: string) => {
    const city = deliveryCities.find(candidate => candidate.name === cityName);
    setAddress(current => {
      const districtStillValid = city?.districts.some(district => district.aliases.some(alias => normalizeDistrictName(alias) === normalizeDistrictName(current.district || "")));
      return { ...current, city: cityName, district: districtStillValid ? current.district : "" };
    });
    setLocationMessage(""); setQuoteError("");
  };
  const chooseDistrict = (districtName: string) => { setAddress(current => ({ ...current, district: districtName })); setLocationMessage(""); setQuoteError(""); };

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (!cart.items.length) { setError("Seu carrinho está vazio."); return; }
    if (channel === "own_delivery" && (!selectedCity || !selectedDistrict)) { setError("Selecione uma cidade e um bairro atendidos para calcular a entrega."); return; }
    const customerName = isTableOrder ? (tabName.trim() || name.trim()) : name.trim();
    const parsed = checkoutSchema.safeParse({ customerName, customerPhone: normalizePhone(phone), channel, paymentMethod: isTableOrder ? "pix" : payment, couponCode: couponCode || undefined, notes: notes || undefined, tableNumber: tableNumber || undefined, tabId: tableTabId, tabName: tabName || undefined, address: channel === "own_delivery" ? { ...address, cep: address.cep.replace(/\D/g, "") } : undefined });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || "Revise os dados do checkout."); return; }
    if (isDemoMode() && couponCode && !coupon) { setError("Cupom inválido, pausado, esgotado ou indisponível para este canal."); return; }
    if (isDemoMode() && coupon?.minimum && cart.subtotal < coupon.minimum) { setError(`Este cupom exige pedido mínimo de ${currency(coupon.minimum)}.`); return; }

    setLoading(true);
    try {
      let finalSubtotal = cart.subtotal, finalDiscount = localDiscount, finalDeliveryFee = 0, finalTotal = Math.max(0, cart.subtotal - localDiscount), finalCoupon = coupon?.code;
      if (!isDemoMode()) {
        const quoteResponse = await fetch("/api/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: cart.items, channel, couponCode: couponCode || undefined, city: channel === "own_delivery" ? parsed.data.address?.city : undefined, district: channel === "own_delivery" ? parsed.data.address?.district : undefined }) });
        const quoteBody = await quoteResponse.json();
        if (!quoteResponse.ok) throw new Error(quoteBody.error || "Não foi possível validar entrega, taxa e descontos.");
        finalSubtotal = quoteBody.subtotal; finalDiscount = quoteBody.discount; finalDeliveryFee = quoteBody.deliveryFee; finalTotal = quoteBody.total; finalCoupon = quoteBody.couponCode;
      }
      if (!isTableOrder && payment === "cash" && needsChange) {
        const cents = Math.round(Number(changeFor.replace(",", ".")) * 100);
        if (!changeFor.trim() || !Number.isFinite(cents) || cents < finalTotal) throw new Error(`O valor para troco deve ser igual ou maior que ${currency(finalTotal)}.`);
      }

      const now = new Date().toISOString();
      let resolvedTabId = isTableOrder ? tableTabId : undefined;
      if (isTableOrder && isDemoMode() && tableNumber) {
        const stillOpen = tables.some(table => table.tabs.some(tab => tab.id === resolvedTabId && (tab.status === "open" || tab.status === "partial")));
        if (!stillOpen) resolvedTabId = demoActions.openTab(tableNumber, tabName.trim(), 1, "Cliente QR", undefined, false);
      }
      let order: Order = {
        id: uid("ord"), number: Math.max(1054, ...orders.map(o => o.number)) + 1, channel, status: "received", paymentStatus: "pending",
        customerName, customerPhone: normalizePhone(phone), address: channel === "own_delivery" ? parsed.data.address : undefined,
        tableNumber: isTableOrder ? tableNumber || undefined : undefined, tabId: resolvedTabId, tabName: isTableOrder ? tabName.trim() : undefined,
        items: cart.items, subtotal: finalSubtotal, discount: finalDiscount, deliveryFee: finalDeliveryFee, total: finalTotal,
        paymentMethod: isTableOrder ? "pix" : payment,
        changeFor: !isTableOrder && payment === "cash" && needsChange ? Math.round(Number(changeFor.replace(",", ".")) * 100) : undefined,
        notes, couponCode: finalCoupon, createdAt: now, updatedAt: now, sourceIdempotencyKey: checkoutKeyRef.current, trackingToken: channel === "own_delivery" ? uid("track") : undefined,
      };

      let accessToken: string | undefined, finalNumber = order.number, finalOrderId = order.id;
      if (isDemoMode()) demoActions.createOrder(order);
      else {
        const send = async (payload: Order) => { const response = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": payload.sourceIdempotencyKey }, body: JSON.stringify(payload) }); const body = await response.json(); return { response, body }; };
        let result = await send(order);
        if (!result.response.ok && isTableOrder && order.tabId && /comanda|mesa/i.test(result.body.error || "")) { localStorage.removeItem(tableTabKey(tableNumber!)); order = { ...order, tabId: undefined }; result = await send(order); }
        if (!result.response.ok) throw new Error(result.body.error || "Falha ao criar pedido.");
        accessToken = result.body.accessToken; finalNumber = Number(result.body.number || order.number); finalOrderId = String(result.body.id || order.id); resolvedTabId = result.body.tabId || order.tabId;
      }
      if (isTableOrder && tableNumber && resolvedTabId) { localStorage.setItem(tableTabKey(tableNumber), resolvedTabId); localStorage.setItem(tableNameKey(tableNumber), tabName.trim()); }
      if (!isTableOrder) {
        try { localStorage.setItem(PROFILE_KEY, JSON.stringify({ name: customerName, phone, address: channel === "own_delivery" ? { ...address, latitude: undefined, longitude: undefined } : undefined } satisfies SavedProfile)); } catch { /* armazenamento indisponível */ }
      }
      customerDeviceActions.saveOrder({ id: finalOrderId, number: finalNumber, token: accessToken, phone: order.customerPhone, total: finalTotal, status: "received", createdAt: now, items: cart.items });
      setConfirmed({id:finalOrderId,number:finalNumber,token:accessToken,payment:isTableOrder?undefined:payment,total:finalTotal}); cart.clear(); cart.setOpen(false); setLoading(false);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível finalizar o pedido."); setLoading(false); }
  };

  if(confirmed) return <main className="grid min-h-screen place-items-center bg-basso-paper p-4"><section className="surface w-full max-w-lg p-6 text-center sm:p-9"><ShoppingBag className="mx-auto text-emerald-700" size={44}/><h1 className="mt-4 font-display text-3xl font-bold">Pedido confirmado!</h1><p className="mt-2 text-black/60">Pedido #{confirmed.number} recebido pela pizzaria.</p><p className="mt-3 text-sm text-black/50">Acompanhe o preparo e a entrega pelo botão abaixo. O status é atualizado automaticamente.</p>{confirmed.payment==="pix"&&<PixPaymentCard total={confirmed.total} className="mt-5"/>}<Link className="btn-primary mt-6 min-h-14 w-full" href={`/pedido/${encodeURIComponent(confirmed.id)}${confirmed.token ? `?token=${encodeURIComponent(confirmed.token)}` : ''}`}>Acompanhar pedido</Link><Link className="btn-secondary mt-3 w-full" href="/meus-pedidos">Meus pedidos</Link><Link className="mt-5 inline-block text-sm font-bold text-basso-wine" href={backHref}>Voltar ao cardápio</Link></section></main>;

  if (!cart.items.length) return <main className="grid min-h-screen place-items-center bg-basso-paper p-6"><div className="surface max-w-md p-8 text-center"><ShoppingBag className="mx-auto text-black/25" size={42}/><h1 className="mt-4 font-display text-2xl font-bold">Carrinho vazio</h1><p className="mt-2 text-sm text-black/50">Adicione itens antes de seguir para o checkout.</p><Link href={backHref} className="btn-primary mt-6 w-full">Voltar ao cardápio</Link></div></main>;

  return <main className="min-h-screen bg-basso-paper"><header className="border-b border-black/5 bg-white"><div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4"><Link href={backHref} className="btn-ghost"><ArrowLeft size={18}/><span className="hidden sm:inline">Voltar</span></Link><Image src="/assets/brand/logo.png" alt="" width={38} height={38} className="rounded-full"/><p className="font-display text-lg font-bold">Finalizar pedido</p></div></header>
    {store.loaded && !store.open && <div role="alert" className="border-b border-amber-200 bg-amber-50"><p className="mx-auto max-w-6xl px-4 py-3 text-sm font-bold text-amber-900">{store.message} Seu carrinho fica salvo para quando abrirmos.</p></div>}
    <form onSubmit={submit} className="mx-auto grid max-w-6xl gap-6 px-4 py-7 lg:grid-cols-[1fr_390px]">
      <div className="space-y-5">
        {isTableOrder ? <Section title={`Pedido na Mesa ${tableNumber || ""}`}><div className="rounded-2xl border border-basso-gold/30 bg-basso-gold/10 p-4"><p className="text-sm font-bold text-basso-wine">O pedido será enviado para a produção e vinculado à sua comanda.</p><p className="mt-1 text-xs text-black/55">O pagamento é realizado no fechamento da comanda com a equipe.</p></div><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Nome da comanda ou participante"><input className="input" value={tabName} onChange={e => { setTabName(e.target.value); setName(e.target.value); }} autoComplete="name"/></Field><Field label="Telefone (opcional)"><input className="input" value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel"/></Field></div></Section> : <><Section title="Como você quer receber?"><div className="grid grid-cols-2 gap-2"><Choice active={channel === "own_delivery"} onClick={() => setChannel("own_delivery")} label="Entrega" disabled={deliveryUnavailable}/><Choice active={channel === "pickup"} onClick={() => setChannel("pickup")} label="Retirada"/></div>{deliveryUnavailable && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-800">Entrega temporariamente indisponível. Você pode retirar o pedido em {store.addressLabel || "Rua do Progresso, 407"}.</p>}{channel === "pickup" && !deliveryUnavailable && <p className="mt-3 text-xs text-black/50">Retirada em {store.addressLabel || "Rua do Progresso, 407 — Centro — Rio Grande da Serra/SP"}.</p>}</Section><Section title="Dados do cliente"><div className="grid gap-4 sm:grid-cols-2"><Field label="Nome completo"><input className="input" value={name} onChange={e => setName(e.target.value)} autoComplete="name"/></Field><Field label="Telefone / WhatsApp"><input className="input" value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" autoComplete="tel"/></Field></div></Section></>}

        {channel === "own_delivery" && <Section title="Endereço de entrega"><button type="button" className="btn-secondary mb-4" onClick={useLocation} disabled={locating || areasLoading}>{locating ? <Loader2 className="animate-spin" size={17}/> : <Crosshair size={17}/>} {locating ? "Localizando e preenchendo..." : "Usar minha localização"}</button>{areasError && <p className="mb-3 rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700">{areasError}</p>}{locationMessage && <p className="mb-3 rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">{locationMessage}</p>}<div className="grid gap-4 sm:grid-cols-6"><div className="sm:col-span-2"><Field label="CEP (opcional)"><input className="input" value={address.cep} onChange={e => changeCep(e.target.value)} inputMode="numeric" autoComplete="postal-code" placeholder="00000-000"/></Field>{cepStatus && <p aria-live="polite" className="mt-1 text-xs font-semibold text-black/55">{cepStatus}</p>}</div><Field label="Rua" className="sm:col-span-4"><input className="input" autoComplete="address-line1" value={address.street} onChange={e => setAddress(a => ({ ...a, street: e.target.value }))}/></Field><Field label="Número" className="sm:col-span-2"><input className="input" inputMode="numeric" autoComplete="address-line2" value={address.number} onChange={e => setAddress(a => ({ ...a, number: e.target.value }))}/></Field><Field label="Cidade atendida" className="sm:col-span-4"><select className="input" value={address.city} onChange={e => chooseCity(e.target.value)} disabled={areasLoading}><option value="">Selecione a cidade</option>{deliveryCities.map(city => <option key={city.name} value={city.name}>{city.name}</option>)}</select></Field><Field label="Bairro atendido" className="sm:col-span-4"><select className="input" value={selectedDistrict?.name || ""} onChange={e => chooseDistrict(e.target.value)} disabled={!selectedCity || areasLoading}><option value="">{selectedCity ? "Selecione o bairro" : "Selecione a cidade primeiro"}</option>{selectedCity?.districts.map(district => <option key={district.name} value={district.name}>{district.name} — {currency(district.fee)}</option>)}</select></Field><Field label="UF" className="sm:col-span-2"><input className="input" value={address.state} maxLength={2} onChange={e => setAddress(a => ({ ...a, state: e.target.value.toUpperCase() }))}/></Field><Field label="Complemento" className="sm:col-span-3"><input className="input" value={address.complement} onChange={e => setAddress(a => ({ ...a, complement: e.target.value }))}/></Field><Field label="Referência" className="sm:col-span-3"><input className="input" value={address.reference} onChange={e => setAddress(a => ({ ...a, reference: e.target.value }))}/></Field></div>{typeof address.latitude === "number" && typeof address.longitude === "number" && <LocationPicker latitude={address.latitude} longitude={address.longitude} onChange={(latitude, longitude) => void adjustLocation(latitude, longitude)}/>}<p className="mt-3 text-xs text-black/45">A localização tenta preencher rua, CEP, cidade e bairro. Confira sempre o número e o complemento.</p>{quoteError && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-800">{quoteError}</p>}</Section>}

        {!isTableOrder && <Section title="Pagamento"><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{publicPaymentMethods.map(id => <Choice key={id} active={payment === id} onClick={() => setPayment(id)} label={paymentMethodLabels[id]}/>)}</div>{payment === "cash" && <div className="mt-4 rounded-2xl border bg-basso-paper p-4"><p className="label">Precisa de troco?</p><div className="mt-2 grid grid-cols-2 gap-2"><Choice active={!needsChange} onClick={() => { setNeedsChange(false); setChangeFor(""); }} label="Não"/><Choice active={needsChange} onClick={() => setNeedsChange(true)} label="Sim"/></div>{needsChange && <Field label="Troco para quanto?" className="mt-4"><input className="input text-lg font-black" value={changeFor} onChange={e => setChangeFor(e.target.value)} inputMode="decimal" placeholder="Ex.: 100,00"/>{changeForCents > 0 && changeForCents < total && <span className="mt-1 block text-xs font-semibold text-red-700">O valor deve ser igual ou maior que o total.</span>}{changeDue != null && <span className="mt-2 block rounded-xl bg-emerald-50 p-3 text-sm font-black text-emerald-800">Troco a levar: {currency(changeDue)}</span>}</Field>}</div>}<p className="mt-3 text-xs text-black/45">Cartões são confirmados presencialmente. VR, benefícios e vouchers são aceitos somente no PDV interno.</p></Section>}
        {isTableOrder && <Section title="Pagamento"><p className="rounded-2xl bg-basso-black p-4 text-sm font-semibold text-white">O pagamento será realizado no fechamento da comanda com a equipe.</p></Section>}
        <Section title="Cupom e observações"><div className="grid gap-4 sm:grid-cols-2"><Field label="Cupom"><input className="input uppercase" value={couponCode} onChange={e => setCouponCode(e.target.value.toUpperCase())}/></Field><Field label="Observações gerais"><textarea className="textarea min-h-20" value={notes} onChange={e => setNotes(e.target.value)} maxLength={500}/></Field></div>{couponCode && <p className={`mt-2 text-xs font-semibold ${quoting ? "text-black/45" : (!isDemoMode() ? serverQuote?.couponCode : coupon?.code) ? "text-emerald-700" : "text-red-600"}`}>{quoting ? "Validando cupom e valores..." : (!isDemoMode() ? serverQuote?.couponCode : coupon?.code) ? `Cupom ${(!isDemoMode() ? serverQuote?.couponCode : coupon?.code) || couponCode} aplicado.` : quoteError || "Cupom não encontrado ou indisponível."}</p>}</Section>
      </div>

      <aside className="lg:sticky lg:top-5 lg:self-start"><div className="surface overflow-hidden"><div className="bg-basso-black p-5 text-white"><h2 className="font-display text-2xl font-bold">Resumo</h2><p className="mt-1 text-xs text-white/55">Valores são validados novamente no servidor.</p></div><div className="max-h-72 space-y-3 overflow-y-auto p-5">{cart.items.map(item => <div key={item.id} className="flex justify-between gap-3 text-sm"><div><strong>{item.quantity}× {item.name}</strong><p className="text-xs text-black/40">{currency(item.unitPrice)} cada</p></div><strong>{currency(item.unitPrice * item.quantity)}</strong></div>)}</div><div className="border-t p-5"><MoneyRow label="Subtotal" value={displaySubtotal}/>{promotionSavings > 0 && <MoneyRow label="Promoções do dia" value={-promotionSavings} success/>}{displayDiscount > 0 && <MoneyRow label="Cupom" value={-displayDiscount} success/>}{channel === "own_delivery" && <MoneyRow label="Entrega" value={displayDeliveryFee}/>}<div className="mt-3 flex justify-between border-t pt-3 text-xl"><strong>Total</strong><strong className="text-basso-wine">{currency(total)}</strong></div>{quoting && <p className="mt-2 text-xs font-semibold text-blue-700">Atualizando preço...</p>}{store.open && !isTableOrder && (channel === "own_delivery" ? store.deliveryMinutes : store.preparationMinutes) ? <p className="mt-2 text-xs text-black/50">Tempo estimado: cerca de {channel === "own_delivery" ? store.deliveryMinutes : store.preparationMinutes} min{channel === "own_delivery" ? " até a entrega" : " para retirada"}.</p> : null}{error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}<button className="btn-primary mt-4 min-h-12 w-full" disabled={loading || quoting || Boolean(quoteError) || !store.open || (channel === "own_delivery" && (!selectedCity || !selectedDistrict || (!isDemoMode() && !serverQuote)))}>{loading ? <Loader2 className="animate-spin" size={18}/> : <LockKeyhole size={18}/>} {loading ? "Enviando..." : isTableOrder ? "Enviar para a cozinha" : "Confirmar pedido"}</button>{!loading && !quoteError && blockReason && <p className="mt-2 text-center text-xs font-semibold text-amber-800">{blockReason}</p>}<p className="mt-3 text-center text-[11px] text-black/40">O total, as promoções, o cupom e a taxa de entrega são conferidos no servidor antes do pedido ser criado.</p></div></div></aside>
    </form>
  </main>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) { return <section className="surface p-5 sm:p-6"><h2 className="font-display text-xl font-bold">{title}</h2><div className="mt-4">{children}</div></section>; }
function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) { return <label className={`block ${className}`}><span className="label">{label}</span>{children}</label>; }
function Choice({ active, onClick, label, disabled = false }: { active: boolean; onClick: () => void; label: string; disabled?: boolean }) { return <button type="button" onClick={onClick} disabled={disabled} aria-pressed={active} className={`min-h-11 rounded-xl border px-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40 ${active ? "border-basso-wine bg-basso-wine text-white" : "border-black/10 bg-white"}`}>{label}</button>; }
function MoneyRow({ label, value, success }: { label: string; value: number; success?: boolean }) { return <div className={`mb-2 flex justify-between text-sm ${success ? "text-emerald-700" : ""}`}><span>{label}</span><strong>{value < 0 ? `− ${currency(Math.abs(value))}` : currency(value)}</strong></div>; }
