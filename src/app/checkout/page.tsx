"use client";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Crosshair, Loader2, LockKeyhole, ShoppingBag } from "lucide-react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useCart } from "@/context/CartContext";
import { useDemoState, demoActions } from "@/lib/demo-store";
import { checkoutSchema } from "@/lib/order-validation";
import { currency, isDemoMode, normalizePhone, uid } from "@/lib/utils";
import type { Address, Order, OrderChannel, PaymentMethod } from "@/types";
import { customerDeviceActions } from "@/lib/customer-device-store";

const LocationPicker = dynamic(() => import("@/components/maps/LocationPicker").then(module => module.LocationPicker), { ssr: false });
const emptyAddress: Address = { cep: "", street: "", number: "", district: "", complement: "", reference: "", city: "Rio Grande da Serra", state: "SP" };
const tableTabKey = (table: number) => `lfb-table-tab-v31-${table}`;
const tableNameKey = (table: number) => `lfb-table-name-v31-${table}`;

type CheckoutQuote = {
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
  couponCode?: string;
  coverageConfigurationPending?: boolean;
};

type ReverseAddressResponse = Partial<Address> & { displayName?: string; error?: string };

export default function CheckoutPage() {
  const cart = useCart();
  const router = useRouter();
  const coupons = useDemoState(s => s.coupons);
  const orders = useDemoState(s => s.orders);
  const tables = useDemoState(s => s.tables);
  const [channel, setChannel] = useState<OrderChannel>("own_delivery");
  const [tableNumber, setTableNumber] = useState<number | null>(null);
  const [tableTabId, setTableTabId] = useState<string | undefined>(undefined);
  const [tabName, setTabName] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState<Address>(emptyAddress);
  const [payment, setPayment] = useState<PaymentMethod>("pix");
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
  const checkoutKeyRef = useRef(uid("checkout"));

  useEffect(() => {
    const table = Number(new URLSearchParams(window.location.search).get("mesa"));
    if (!Number.isInteger(table) || table < 1 || table > 15) return;
    setTableNumber(table);
    setChannel("table_qr");
    const storedTab = localStorage.getItem(tableTabKey(table)) || undefined;
    const storedName = localStorage.getItem(tableNameKey(table)) || "";
    setTableTabId(storedTab);
    setTabName(storedName);
    setName(storedName);
  }, []);

  const isTableOrder = channel === "table_qr";
  const backHref = tableNumber ? `/?mesa=${tableNumber}` : "/";
  const coupon = useMemo(() => coupons.find(c => c.active && c.code.toUpperCase() === couponCode.trim().toUpperCase() && (c.totalLimit == null || c.uses < c.totalLimit) && c.channels.includes(channel)), [coupons, couponCode, channel]);
  const discount = useMemo(() => {
    if (!coupon || (coupon.minimum && cart.subtotal < coupon.minimum)) return 0;
    return coupon.type === "percentage" ? Math.round(cart.subtotal * coupon.value / 100) : Math.min(coupon.value, cart.subtotal);
  }, [coupon, cart.subtotal]);
  const localDeliveryFee = 0;
  const localTotal = Math.max(0, cart.subtotal - discount + localDeliveryFee);
  const displaySubtotal = !isDemoMode() && serverQuote ? serverQuote.subtotal : cart.subtotal;
  const displayDiscount = !isDemoMode() && serverQuote ? serverQuote.discount : discount;
  const displayDeliveryFee = !isDemoMode() && serverQuote ? serverQuote.deliveryFee : localDeliveryFee;
  const total = !isDemoMode() && serverQuote ? serverQuote.total : localTotal;

  useEffect(() => {
    if (isDemoMode() || !cart.items.length) return;
    if (channel === "own_delivery" && !address.district.trim()) {
      setServerQuote(null);
      setQuoteError("");
      return;
    }
    setServerQuote(null);
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setQuoting(true);
      setQuoteError("");
      try {
        const response = await fetch("/api/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: cart.items,
            channel,
            couponCode: couponCode.trim() || undefined,
            district: channel === "own_delivery" ? address.district.trim() : undefined,
          }),
        });
        const body = await response.json().catch(() => null) as CheckoutQuote & { error?: string } | null;
        if (!response.ok) throw new Error(body?.error || "Não foi possível atualizar o total.");
        if (!cancelled && body) setServerQuote(body);
      } catch (quoteFailure) {
        if (!cancelled) {
          setServerQuote(null);
          setQuoteError(quoteFailure instanceof Error ? quoteFailure.message : "Não foi possível atualizar o total.");
        }
      } finally {
        if (!cancelled) setQuoting(false);
      }
    }, 550);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [address.district, cart.items, channel, couponCode]);

  async function fillAddressFromCoordinates(latitude: number, longitude: number) {
    setAddress(current => ({ ...current, latitude, longitude }));
    const response = await fetch("/api/geocode/reverse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latitude, longitude }),
    });
    const body = await response.json().catch(() => null) as ReverseAddressResponse | null;
    if (!response.ok || !body) throw new Error(body?.error || "Não foi possível identificar o endereço desta localização.");

    setAddress(current => ({
      ...current,
      cep: body.cep || current.cep,
      street: body.street || current.street,
      number: body.number || current.number,
      district: body.district || current.district,
      city: body.city || current.city,
      state: body.state || current.state,
      latitude,
      longitude,
    }));
    setLocationMessage("Endereço preenchido pela sua localização. Confira o número e o complemento antes de continuar.");
  }

  const useLocation = () => {
    if (!navigator.geolocation) { setError("Geolocalização não está disponível neste aparelho."); return; }
    setLocating(true); setError(""); setLocationMessage("");
    navigator.geolocation.getCurrentPosition(async pos => {
      const { latitude, longitude } = pos.coords;
      try {
        await fillAddressFromCoordinates(latitude, longitude);
      } catch (locationError) {
        setAddress(current => ({ ...current, latitude, longitude }));
        setError(locationError instanceof Error ? `${locationError.message} As coordenadas foram salvas; complete o endereço manualmente.` : "Localização encontrada, mas não foi possível preencher o endereço automaticamente.");
      } finally {
        setLocating(false);
      }
    }, () => {
      setError("Não foi possível obter sua localização. Confirme a permissão do navegador.");
      setLocating(false);
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30_000 });
  };

  const adjustLocation = async (latitude: number, longitude: number) => {
    setError("");
    setLocationMessage("Atualizando endereço a partir do novo ponto...");
    try {
      await fillAddressFromCoordinates(latitude, longitude);
    } catch (locationError) {
      setAddress(current => ({ ...current, latitude, longitude }));
      setLocationMessage("");
      setError(locationError instanceof Error ? locationError.message : "Não foi possível atualizar o endereço pelo mapa.");
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (!cart.items.length) { setError("Seu carrinho está vazio."); return; }
    const customerName = isTableOrder ? (tabName.trim() || name.trim()) : name.trim();
    const parsed = checkoutSchema.safeParse({
      customerName,
      customerPhone: normalizePhone(phone),
      channel,
      paymentMethod: payment,
      couponCode: couponCode || undefined,
      notes: notes || undefined,
      tableNumber: tableNumber || undefined,
      tabId: tableTabId,
      tabName: tabName || undefined,
      address: channel === "own_delivery" ? { ...address, cep: address.cep.replace(/\D/g, "") } : undefined
    });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || "Revise os dados do checkout."); return; }
    if (isDemoMode() && couponCode && !coupon) { setError("Cupom inválido, pausado, esgotado ou indisponível para este canal."); return; }
    if (isDemoMode() && coupon?.minimum && cart.subtotal < coupon.minimum) { setError(`Este cupom exige pedido mínimo de ${currency(coupon.minimum)}.`); return; }

    setLoading(true);
    try {
      let finalSubtotal = cart.subtotal;
      let finalDiscount = discount;
      let finalDeliveryFee = localDeliveryFee;
      let finalTotal = localTotal;
      let finalCoupon = coupon?.code;
      if (!isDemoMode()) {
        const quoteResponse = await fetch("/api/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: cart.items, channel, couponCode: couponCode || undefined, district: channel === "own_delivery" ? parsed.data.address?.district : undefined }) });
        const quoteBody = await quoteResponse.json();
        if (!quoteResponse.ok) throw new Error(quoteBody.error || "Não foi possível validar entrega, taxa e descontos.");
        finalSubtotal = quoteBody.subtotal;
        finalDiscount = quoteBody.discount;
        finalDeliveryFee = quoteBody.deliveryFee;
        finalTotal = quoteBody.total;
        finalCoupon = quoteBody.couponCode;
      }

      if (!isTableOrder && payment === "cash" && changeFor.trim()) {
        const changeForCents = Math.round(Number(changeFor.replace(",", ".")) * 100);
        if (!Number.isFinite(changeForCents) || changeForCents < finalTotal) {
          throw new Error(`O valor para troco deve ser igual ou maior que ${currency(finalTotal)}.`);
        }
      }

      const now = new Date().toISOString();
      const id = uid("ord");
      let resolvedTabId = isTableOrder ? tableTabId : undefined;
      if (isTableOrder && isDemoMode() && tableNumber) {
        const stillOpen = tables.some(table => table.tabs.some(tab => tab.id === resolvedTabId && (tab.status === "open" || tab.status === "partial")));
        if (!stillOpen) resolvedTabId = demoActions.openTab(tableNumber, tabName.trim(), 1, "Cliente QR", undefined, false);
      }
      let order: Order = {
        id,
        number: Math.max(1054, ...orders.map(o => o.number)) + 1,
        channel,
        status: "received",
        paymentStatus: "pending",
        customerName,
        customerPhone: normalizePhone(phone),
        address: channel === "own_delivery" ? parsed.data.address : undefined,
        tableNumber: isTableOrder ? tableNumber || undefined : undefined,
        tabId: resolvedTabId,
        tabName: isTableOrder ? tabName.trim() : undefined,
        items: cart.items,
        subtotal: finalSubtotal,
        discount: finalDiscount,
        deliveryFee: finalDeliveryFee,
        total: finalTotal,
        paymentMethod: isTableOrder ? "pix" : payment,
        changeFor: !isTableOrder && payment === "cash" && changeFor ? Math.round(Number(changeFor.replace(",", ".")) * 100) : undefined,
        notes,
        couponCode: finalCoupon,
        createdAt: now,
        updatedAt: now,
        sourceIdempotencyKey: checkoutKeyRef.current,
        trackingToken: channel === "own_delivery" ? uid("track") : undefined
      };

      let accessToken: string | undefined;
      let finalNumber = order.number;
      let finalOrderId = order.id;
      if (isDemoMode()) {
        demoActions.createOrder(order);
      } else {
        const send = async (payload: Order) => {
          const response = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": payload.sourceIdempotencyKey }, body: JSON.stringify(payload) });
          const body = await response.json();
          return { response, body };
        };
        let result = await send(order);
        if (!result.response.ok && isTableOrder && order.tabId && /comanda|mesa/i.test(result.body.error || "")) {
          localStorage.removeItem(tableTabKey(tableNumber!));
          order = { ...order, tabId: undefined };
          result = await send(order);
        }
        if (!result.response.ok) throw new Error(result.body.error || "Falha ao criar pedido.");
        accessToken = result.body.accessToken;
        finalNumber = Number(result.body.number || order.number);
        finalOrderId = String(result.body.id || order.id);
        resolvedTabId = result.body.tabId || order.tabId;
      }

      if (isTableOrder && tableNumber && resolvedTabId) {
        localStorage.setItem(tableTabKey(tableNumber), resolvedTabId);
        localStorage.setItem(tableNameKey(tableNumber), tabName.trim());
      }
      customerDeviceActions.saveOrder({ id: finalOrderId, number: finalNumber, token: accessToken, phone: order.customerPhone, total: finalTotal, status: "received", createdAt: now, items: cart.items });
      cart.clear();
      router.push(`/pedido/${finalOrderId}${accessToken ? `?token=${encodeURIComponent(accessToken)}` : ""}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível finalizar o pedido.");
      setLoading(false);
    }
  };

  if (!cart.items.length) return <main className="grid min-h-screen place-items-center bg-basso-paper p-6"><div className="surface max-w-md p-8 text-center"><ShoppingBag className="mx-auto text-black/25" size={42}/><h1 className="mt-4 font-display text-2xl font-bold">Carrinho vazio</h1><p className="mt-2 text-sm text-black/50">Adicione itens antes de seguir para o checkout.</p><Link href={backHref} className="btn-primary mt-6 w-full">Voltar ao cardápio</Link></div></main>;

  return <main className="min-h-screen bg-basso-paper"><header className="border-b border-black/5 bg-white"><div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4"><Link href={backHref} className="btn-ghost"><ArrowLeft size={18}/><span className="hidden sm:inline">Voltar</span></Link><Image src="/assets/brand/logo.png" alt="" width={38} height={38} className="rounded-full"/><p className="font-display text-lg font-bold">Finalizar pedido</p></div></header>
    <form onSubmit={submit} className="mx-auto grid max-w-6xl gap-6 px-4 py-7 lg:grid-cols-[1fr_390px]">
      <div className="space-y-5">
        {isTableOrder ? <Section title={`Pedido na Mesa ${tableNumber || ""}`}><div className="rounded-2xl border border-basso-gold/30 bg-basso-gold/10 p-4"><p className="text-sm font-bold text-basso-wine">O pedido será enviado para a produção e vinculado à sua comanda.</p><p className="mt-1 text-xs leading-relaxed text-black/55">O QR Code não fecha a mesa, não recebe pagamento automaticamente e não permite cancelamento definitivo. A equipe mantém o controle da comanda.</p></div><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Nome da comanda ou participante"><input className="input" value={tabName} onChange={e => { setTabName(e.target.value); setName(e.target.value); }} autoComplete="name" placeholder="Ex.: Pedro"/></Field><Field label="Telefone (opcional)"><input className="input" value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="(11) 99999-9999"/></Field></div>{tableTabId && <p className="mt-3 text-xs font-semibold text-emerald-700">Comanda deste aparelho identificada. Novos itens serão vinculados à mesma comanda enquanto ela estiver aberta.</p>}</Section> : <>
          <Section title="Como você quer receber?"><div className="grid grid-cols-2 gap-2"><Choice active={channel === "own_delivery"} onClick={() => setChannel("own_delivery")} label="Entrega"/><Choice active={channel === "pickup"} onClick={() => setChannel("pickup")} label="Retirada"/></div></Section>
          <Section title="Dados do cliente"><div className="grid gap-4 sm:grid-cols-2"><Field label="Nome completo"><input className="input" value={name} onChange={e => setName(e.target.value)} autoComplete="name"/></Field><Field label="Telefone / WhatsApp"><input className="input" value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="(11) 99999-9999"/></Field></div></Section>
        </>}

        {channel === "own_delivery" && <Section title="Endereço de entrega"><button type="button" className="btn-secondary mb-4" onClick={useLocation} disabled={locating}>{locating ? <Loader2 className="animate-spin" size={17}/> : <Crosshair size={17}/>} {locating ? "Localizando e preenchendo..." : "Usar minha localização"}</button>{locationMessage && <p className="mb-3 rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">{locationMessage}</p>}<div className="grid gap-4 sm:grid-cols-6"><Field label="CEP" className="sm:col-span-2"><input className="input" value={address.cep} onChange={e => setAddress(a => ({ ...a, cep: e.target.value }))} inputMode="numeric" autoComplete="postal-code"/></Field><Field label="Rua" className="sm:col-span-4"><input className="input" value={address.street} onChange={e => setAddress(a => ({ ...a, street: e.target.value }))} autoComplete="street-address"/></Field><Field label="Número" className="sm:col-span-2"><input className="input" value={address.number} onChange={e => setAddress(a => ({ ...a, number: e.target.value }))}/></Field><Field label="Bairro" className="sm:col-span-4"><input className="input" value={address.district} onChange={e => setAddress(a => ({ ...a, district: e.target.value }))}/></Field><Field label="Complemento" className="sm:col-span-3"><input className="input" value={address.complement} onChange={e => setAddress(a => ({ ...a, complement: e.target.value }))}/></Field><Field label="Referência" className="sm:col-span-3"><input className="input" value={address.reference} onChange={e => setAddress(a => ({ ...a, reference: e.target.value }))}/></Field><Field label="Cidade" className="sm:col-span-4"><input className="input" value={address.city} onChange={e => setAddress(a => ({ ...a, city: e.target.value }))} autoComplete="address-level2"/></Field><Field label="UF" className="sm:col-span-2"><input className="input" value={address.state} maxLength={2} onChange={e => setAddress(a => ({ ...a, state: e.target.value.toUpperCase() }))} autoComplete="address-level1"/></Field></div>{typeof address.latitude === "number" && typeof address.longitude === "number" && <LocationPicker latitude={address.latitude} longitude={address.longitude} onChange={(latitude, longitude) => void adjustLocation(latitude, longitude)}/>}<p className="mt-3 text-xs text-black/45">Ao localizar ou mover o pino, o endereço é preenchido automaticamente e a taxa é recalculada pelo bairro cadastrado.</p>{quoteError && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-800">{quoteError}</p>}</Section>}

        {!isTableOrder && <Section title="Pagamento"><div className="grid gap-2 sm:grid-cols-3">{([["pix","Pix"],["cash","Dinheiro"],["debit","Débito"],["credit","Crédito"],["meal_voucher","Refeição"],["food_voucher","Alimentação"]] as [PaymentMethod,string][]).map(([id,label]) => <Choice key={id} active={payment === id} onClick={() => setPayment(id)} label={label}/>)}</div>{payment === "cash" && <Field label="Troco para quanto?" className="mt-4"><input className="input" value={changeFor} onChange={e => setChangeFor(e.target.value)} inputMode="decimal" placeholder="Ex.: 100,00"/></Field>}<p className="mt-3 text-xs text-black/45">Pagamentos em cartão são confirmados presencialmente. Dados de cartão e CVV não são armazenados.</p></Section>}
        {isTableOrder && <Section title="Pagamento"><p className="rounded-2xl bg-basso-black p-4 text-sm font-semibold text-white">O pagamento será realizado no fechamento da comanda com a equipe. Nenhuma cobrança é feita pelo QR Code.</p></Section>}

        <Section title="Cupom e observações"><div className="grid gap-4 sm:grid-cols-2"><Field label="Cupom"><input className="input uppercase" value={couponCode} onChange={e => setCouponCode(e.target.value.toUpperCase())} placeholder="Código do cupom"/></Field><Field label="Observações gerais"><textarea className="textarea min-h-20" value={notes} onChange={e => setNotes(e.target.value)} maxLength={500}/></Field></div>{couponCode && <p className={`mt-2 text-xs font-semibold ${quoting ? "text-black/45" : (!isDemoMode() ? serverQuote?.couponCode : coupon?.code) ? "text-emerald-700" : "text-red-600"}`}>{quoting ? "Validando cupom e valores..." : (!isDemoMode() ? serverQuote?.couponCode : coupon?.code) ? `Cupom ${(!isDemoMode() ? serverQuote?.couponCode : coupon?.code) || couponCode} aplicado.` : quoteError || "Cupom não encontrado ou indisponível."}</p>}</Section>
      </div>

      <aside className="lg:sticky lg:top-5 lg:self-start"><div className="surface overflow-hidden"><div className="bg-basso-black p-5 text-white"><h2 className="font-display text-2xl font-bold">Resumo</h2><p className="mt-1 text-xs text-white/55">Confira os itens antes de enviar.</p></div><div className="max-h-72 space-y-3 overflow-y-auto p-5">{cart.items.map(i => <div key={i.id} className="flex justify-between gap-4 text-sm"><div><strong>{i.quantity}× {i.name}</strong></div><span className="shrink-0 font-semibold">{currency(i.unitPrice * i.quantity)}</span></div>)}</div><div className="space-y-2 border-t border-black/5 p-5 text-sm"><Line label="Subtotal" value={currency(displaySubtotal)}/>{displayDiscount > 0 && <Line label="Desconto" value={`− ${currency(displayDiscount)}`} good/>}<Line label="Taxa de entrega" value={channel === "own_delivery" ? (serverQuote ? currency(displayDeliveryFee) : quoting ? "Calculando..." : quoteError ? "Indisponível" : "Informe o bairro") : currency(0)}/>{isTableOrder && <Line label="Destino" value={`Mesa ${tableNumber}`}/>}<div className="my-3 border-t border-dashed border-black/10"/><div className="flex items-center justify-between text-lg"><strong>Total</strong><strong className="text-basso-wine">{currency(total)}</strong></div><button type="submit" className="btn-primary mt-4 w-full py-3.5" disabled={loading || quoting || (channel === "own_delivery" && (!serverQuote || serverQuote.coverageConfigurationPending))}>{loading ? <Loader2 className="animate-spin"/> : <LockKeyhole size={18}/>} {isTableOrder ? "Enviar para a comanda" : "Confirmar pedido"}</button><p className="text-center text-[11px] text-black/40">Ao confirmar, você concorda com os termos e a política de privacidade.</p></div></div>{error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}</aside>
    </form>
  </main>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) { return <section className="surface p-5 sm:p-6"><h2 className="mb-5 font-display text-xl font-bold">{title}</h2>{children}</section>; }
function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) { return <label className={`block ${className}`}><span className="label">{label}</span>{children}</label>; }
function Choice({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) { return <button type="button" onClick={onClick} className={`min-h-12 rounded-xl border px-3 text-sm font-bold transition ${active ? "border-basso-wine bg-basso-wine text-white" : "border-black/10 bg-white text-black/60 hover:border-basso-gold"}`}>{label}</button>; }
function Line({ label, value, good }: { label: string; value: string; good?: boolean }) { return <div className="flex justify-between gap-3"><span className="text-black/55">{label}</span><span className={good ? "font-semibold text-emerald-700" : "font-semibold"}>{value}</span></div>; }
