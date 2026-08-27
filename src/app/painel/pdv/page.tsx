"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Banknote, CreditCard, Gift, Minus, Plus, Search, ShoppingCart, Trash2, Truck, Store, UtensilsCrossed, PackageCheck } from "lucide-react";
import { PageHeader } from "@/components/internal/PageHeader";
import { PizzaBuilder } from "@/components/public/PizzaBuilder";
import { RewardBuilder, type RewardAuthorizationData } from "@/components/internal/RewardBuilder";
import { allProducts, catalog } from "@/lib/catalog";
import { demoActions, useDemoState } from "@/lib/demo-store";
import { apiJson, formatApiError, requestOperationalRefresh } from "@/lib/client/api";
import { currency, isDemoMode, uid } from "@/lib/utils";
import type { Address, CartItem, Flavor, MenuCategory, Order, OrderChannel, PaymentMethod, Product } from "@/types";

const blankAddress: Address = { cep:"", street:"", number:"", district:"", city:"Rio Grande da Serra", state:"SP" };
type RuntimeFlavor = Flavor & { availableChannels?: OrderChannel[] };
type RuntimeProduct = Product & { availableChannels?: OrderChannel[]; stockAvailable?: boolean };
type DeliveryQuote = { subtotal:number; discount:number; deliveryFee:number; total:number };

function PdvContent() {
  const searchParams = useSearchParams();
  const appendTo = searchParams.get("appendTo");
  const appendNumber = searchParams.get("number");
  const orders = useDemoState(state=>state.orders);
  const tables = useDemoState(state=>state.tables);

  const [items,setItems] = useState<CartItem[]>([]);
  const [query,setQuery] = useState("");
  const [customer,setCustomer] = useState("Cliente balcão");
  const [phone,setPhone] = useState("");
  const [channel,setChannel] = useState<OrderChannel>("counter");
  const [payment,setPayment] = useState<PaymentMethod>("cash");
  const [paid,setPaid] = useState(true);
  const [message,setMessage] = useState("");
  const [selectedFlavor,setSelectedFlavor] = useState<Flavor|null>(null);
  const [rewardAuth,setRewardAuth] = useState<RewardAuthorizationData|null>(null);
  const [rewardOpen,setRewardOpen] = useState(false);
  const [address,setAddress] = useState<Address>(blankAddress);
  const [tableNumber,setTableNumber] = useState(1);
  const [tabId,setTabId] = useState("");
  const [newTabName,setNewTabName] = useState("");
  const [discount,setDiscount] = useState("");
  const [discountReason,setDiscountReason] = useState("");
  const [submitting,setSubmitting] = useState(false);
  const [customerId,setCustomerId] = useState<string|undefined>();
  const [origin,setOrigin] = useState<"counter"|"whatsapp"|"phone">("counter");
  const [customerMatches,setCustomerMatches] = useState<Array<{id:string;name:string;phone:string;address?:Address}>>([]);
  const [searchingCustomer,setSearchingCustomer] = useState(false);
  const [runtimeProducts,setRuntimeProducts] = useState<RuntimeProduct[]>(allProducts);
  const [runtimeFlavors,setRuntimeFlavors] = useState<RuntimeFlavor[]>(catalog.flavors);
  const [categories,setCategories] = useState<MenuCategory[]>([]);
  const [menuLoading,setMenuLoading] = useState(true);
  const [deliveryQuote,setDeliveryQuote] = useState<DeliveryQuote|null>(null);
  const [deliveryQuoteError,setDeliveryQuoteError] = useState("");
  const [quotingDelivery,setQuotingDelivery] = useState(false);

  useEffect(()=>{
    try {
      if(!window.location.search.includes("reward=1")) return;
      const parsed=JSON.parse(sessionStorage.getItem("lfb-reward-authorization")||"null") as RewardAuthorizationData|null;
      if(!parsed) return;
      setRewardAuth(parsed);setCustomer(parsed.customerName);setPhone(parsed.customerPhone);setChannel("own_delivery");setPaid(false);setRewardOpen(true);
    } catch {}
  },[]);

  useEffect(()=>{
    let cancelled=false;
    async function loadMenu(){
      setMenuLoading(true);
      try{
        if(isDemoMode()) return;
        const body=await apiJson<{products:RuntimeProduct[];flavors:RuntimeFlavor[];categories:MenuCategory[]}>("/api/menu/availability");
        if(cancelled)return;
        setRuntimeProducts(body.products||[]);setRuntimeFlavors(body.flavors||[]);setCategories(body.categories||[]);
      }catch(error){if(!cancelled)setMessage(formatApiError(error,"Falha ao carregar o cardápio atualizado do PDV."));}
      finally{if(!cancelled)setMenuLoading(false)}
    }
    void loadMenu();return()=>{cancelled=true};
  },[]);

  const products=useMemo(()=>runtimeProducts.filter(product=>{
    const channelOk=!product.availableChannels?.length||product.availableChannels.includes(channel);
    const searchable=!query||`${product.name} ${product.description||""}`.toLowerCase().includes(query.toLowerCase());
    return product.active&&product.stockAvailable!==false&&channelOk&&product.category!=="combo"&&searchable;
  }),[runtimeProducts,channel,query]);
  const flavors=useMemo(()=>runtimeFlavors.filter(flavor=>{
    const channelOk=!flavor.availableChannels?.length||flavor.availableChannels.includes(channel);
    return flavor.active&&channelOk&&(!query||`${flavor.name} ${flavor.description||""}`.toLowerCase().includes(query.toLowerCase()));
  }),[runtimeFlavors,channel,query]);
  const availableTabs=tables.find(table=>table.number===tableNumber)?.tabs.filter(tab=>tab.status!=="closed"&&tab.status!=="cancelled")||[];
  const subtotal=items.reduce((sum,item)=>sum+item.unitPrice*item.quantity,0);
  const discountCents=Math.max(0,Math.min(subtotal,Math.round((Number(discount.replace(",","."))||0)*100)));
  const deliveryFee=channel==="own_delivery"?(deliveryQuote?.deliveryFee||0):0;
  const displayedTotal=Math.max(0,subtotal-discountCents+deliveryFee);

  useEffect(()=>{
    setDeliveryQuote(null);setDeliveryQuoteError("");
    if(channel!=="own_delivery"||items.length===0||address.district.trim().length<2||items.some(item=>item.kind==="reward"))return;
    const timer=window.setTimeout(async()=>{
      setQuotingDelivery(true);
      try{
        const quote=await apiJson<DeliveryQuote>("/api/quote",{method:"POST",body:JSON.stringify({items,channel:"own_delivery",district:address.district.trim()})});
        setDeliveryQuote(quote);setDeliveryQuoteError("");
      }catch(error){setDeliveryQuote(null);setDeliveryQuoteError(formatApiError(error,"Não foi possível calcular a entrega."));}
      finally{setQuotingDelivery(false)}
    },350);
    return()=>window.clearTimeout(timer);
  },[channel,address.district,items]);

  function chooseChannel(next:OrderChannel){
    setChannel(next);
    const isDelivery=next==="own_delivery";
    setPaid(!isDelivery);
    if(!isDelivery)setOrigin("counter");
  }

  const addItem=(item:CartItem)=>setItems(current=>[...current,item]);
  const addProduct=(id:string)=>{
    const product=runtimeProducts.find(item=>item.id===id);if(!product)return;
    setItems(current=>{const existing=current.find(item=>item.productId===product.id&&item.kind==="product");if(existing)return current.map(item=>item.id===existing.id?{...item,quantity:item.quantity+1}:item);return[...current,{id:uid("pdv"),kind:"product",name:product.name,quantity:1,unitPrice:product.price,image:product.image,productId:product.id}]});
  };

  async function searchCustomerBase(){
    const term=(phone||customer).trim();if(term.length<2){setMessage("Digite nome ou telefone para buscar na base de clientes.");return}
    setSearchingCustomer(true);setMessage("");
    try{const body=await apiJson<{customers:Array<{id:string;name:string;phone:string;address?:Address}>}>(`/api/crm?q=${encodeURIComponent(term)}&limit=8`);setCustomerMatches(body.customers||[]);if(!(body.customers||[]).length)setMessage("Nenhum cliente encontrado na base.");}
    catch(error){setMessage(formatApiError(error,"Falha ao consultar a base de clientes."));}
    finally{setSearchingCustomer(false)}
  }
  function selectCustomerBase(match:{id:string;name:string;phone:string;address?:Address}){setCustomerId(match.id);setCustomer(match.name);setPhone(match.phone);if(match.address)setAddress(match.address);setCustomerMatches([]);chooseChannel("own_delivery");}

  async function finish(){
    setMessage("");
    if(!items.length){setMessage("Adicione pelo menos um item.");return}
    if(appendTo){
      setSubmitting(true);
      try{if(isDemoMode()){const target=orders.find(order=>order.id===appendTo);if(!target)throw new Error("Pedido não encontrado.");const merged=[...target.items,...items];const nextSubtotal=merged.reduce((sum,item)=>sum+item.unitPrice*item.quantity,0);demoActions.patchOrder(appendTo,{items:merged,subtotal:nextSubtotal,total:Math.max(0,nextSubtotal-target.discount+target.deliveryFee)},"Atendente");}else{for(const item of items)await apiJson(`/api/orders/${appendTo}/items`,{method:"POST",body:JSON.stringify(item)});}setItems([]);setMessage(`Itens adicionados ao pedido #${appendNumber||appendTo} e enviados à produção.`);requestOperationalRefresh();}
      catch(error){setMessage(formatApiError(error,"Falha ao adicionar itens."));}finally{setSubmitting(false)}return;
    }
    if(phone&&phone.replace(/\D/g,"").length<10){setMessage("Telefone inválido.");return}
    if(channel==="own_delivery"&&(!phone||!address.street||!address.number||!address.district||!address.cep)){setMessage("Preencha telefone e endereço completo para entrega.");return}
    if(channel==="own_delivery"&&deliveryQuoteError){setMessage(deliveryQuoteError);return}
    if(channel==="own_delivery"&&!deliveryQuote&&!items.some(item=>item.kind==="reward")){setMessage("Aguarde o cálculo da taxa de entrega antes de finalizar.");return}
    if(channel==="dine_in"&&(tableNumber<1||tableNumber>15)){setMessage("Mesa inválida.");return}
    if(discountCents>0&&discountReason.trim().length<2){setMessage("Informe o motivo do desconto manual.");return}
    const hasReward=items.some(item=>item.kind==="reward");if(hasReward&&!rewardAuth){setMessage("A recompensa exige autorização interna.");return}

    setSubmitting(true);
    try{
      let resolvedTabId=tabId;let resolvedTabName=availableTabs.find(tab=>tab.id===tabId)?.name||newTabName.trim();
      if(channel==="dine_in"&&!resolvedTabId){if(!resolvedTabName)throw new Error("Selecione ou crie uma comanda para a mesa.");if(isDemoMode())resolvedTabId=demoActions.openTab(tableNumber,resolvedTabName,1,"Atendente");else{const tabBody=await apiJson<{id:string}>(`/api/tables/${tableNumber}/tabs`,{method:"POST",body:JSON.stringify({name:resolvedTabName,people:1})});resolvedTabId=tabBody.id;}}
      const now=new Date().toISOString();const id=uid("pdv");
      const order:Order={id,number:Math.max(1054,...orders.map(order=>order.number))+1,channel,status:"confirmed",paymentStatus:paid?"paid":"pending",customerName:customer||"Cliente balcão",customerPhone:phone.replace(/\D/g,""),customerId,origin:channel==="own_delivery"?origin:"counter",address:channel==="own_delivery"?address:undefined,tableNumber:channel==="dine_in"?tableNumber:undefined,tabId:channel==="dine_in"?resolvedTabId:undefined,tabName:channel==="dine_in"?resolvedTabName:undefined,items,subtotal,discount:discountCents,deliveryFee,total:displayedTotal,paymentMethod:payment,createdAt:now,updatedAt:now,sourceIdempotencyKey:uid("pdvkey"),rewardAuthorizationToken:rewardAuth?.token};
      let finalNumber=order.number;let finalTotal=displayedTotal;
      if(isDemoMode())demoActions.addOrderLocal(order,"Atendente");else{const body=await apiJson<{number:number;total:number}>("/api/internal-orders",{method:"POST",headers:{"Idempotency-Key":order.sourceIdempotencyKey},body:JSON.stringify({...order,discountReason,rewardAuthorizationToken:rewardAuth?.token})});finalNumber=Number(body.number||order.number);finalTotal=Number(body.total??displayedTotal);requestOperationalRefresh();}
      setItems([]);setDiscount("");setDiscountReason("");setTabId("");setNewTabName("");setRewardAuth(null);setCustomerId(undefined);setCustomerMatches([]);setDeliveryQuote(null);sessionStorage.removeItem("lfb-reward-authorization");
      setMessage(`${channel==="own_delivery"?"Pedido de entrega":"Venda"} #${finalNumber} registrada por ${currency(finalTotal)}, auditada e enviada à produção.`);
    }catch(error){setMessage(formatApiError(error,"Falha ao registrar venda."));}finally{setSubmitting(false)}
  }

  return <>
    <PageHeader title={appendTo?`Adicionar itens ao pedido #${appendNumber||""}`:"PDV e balcão"} icon={ShoppingCart} description={appendTo?"Monte novos itens com as mesmas regras do cardápio e envie para a comanda existente.":"Balcão, retirada, salão e entrega em uma única tela, usando o cardápio e as taxas atuais do sistema."}/>
    <div className="grid gap-6 xl:grid-cols-[1.5fr_.8fr]">
      <section>
        <div className="surface mb-4 p-4">
          <label className="relative block"><Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30"/><input className="input pl-9" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar sabor ou produto"/></label>
          {!appendTo&&<div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4"><ChannelButton active={channel==="counter"} icon={<Store size={17}/>} label="Balcão" onClick={()=>chooseChannel("counter")}/><ChannelButton active={channel==="pickup"} icon={<PackageCheck size={17}/>} label="Retirada" onClick={()=>chooseChannel("pickup")}/><ChannelButton active={channel==="dine_in"} icon={<UtensilsCrossed size={17}/>} label="Salão" onClick={()=>chooseChannel("dine_in")}/><ChannelButton active={channel==="own_delivery"} icon={<Truck size={17}/>} label="Entrega" onClick={()=>chooseChannel("own_delivery")}/></div>}
        </div>
        {menuLoading&&<p className="mb-3 text-sm text-black/45">Atualizando cardápio do PDV…</p>}
        <div className="mb-3 flex items-center justify-between"><h2 className="font-display text-xl font-bold">Pizzas</h2><span className="text-xs text-black/40">Somente sabores ativos neste canal</span></div>
        <div className="grid max-h-[38vh] gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">{flavors.map(flavor=><button key={flavor.id} onClick={()=>setSelectedFlavor(flavor)} className="surface flex min-h-28 flex-col items-start p-4 text-left transition hover:-translate-y-0.5 hover:border-basso-gold"><span className="text-xs font-bold uppercase tracking-wide text-black/35">{categories.find(category=>category.id===flavor.category)?.name||flavor.category}</span><strong className="mt-2 line-clamp-2 font-display text-lg">{flavor.name}</strong><span className="mt-auto pt-3 font-bold text-basso-wine">A partir de {currency(Math.min(flavor.priceBroto,flavor.priceGrande))}</span></button>)}</div>
        <div className="mb-3 mt-6 flex items-center justify-between"><h2 className="font-display text-xl font-bold">Produtos</h2><span className="text-xs text-black/40">Produtos novos do administrativo aparecem aqui automaticamente</span></div>
        <div className="grid max-h-[34vh] gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">{products.map(product=><button key={product.id} onClick={()=>addProduct(product.id)} className="surface flex min-h-24 flex-col items-start p-4 text-left transition hover:-translate-y-0.5 hover:border-basso-gold"><span className="text-xs font-bold uppercase text-black/35">{categories.find(category=>category.id===product.category)?.name||product.category}</span><strong className="mt-2 line-clamp-2 font-display text-base">{product.name}</strong><span className="mt-auto pt-2 font-bold text-basso-wine">{currency(product.price)}</span></button>)}{!products.length&&!menuLoading&&<p className="col-span-full p-6 text-center text-sm text-black/40">Nenhum produto disponível neste canal.</p>}</div>
      </section>

      <aside><div className="surface sticky top-20 overflow-hidden"><div className="bg-basso-black p-5 text-white"><div className="flex items-center justify-between gap-3"><h2 className="font-display text-2xl font-bold">{channel==="own_delivery"?"Pedido para entrega":"Venda atual"}</h2>{channel==="own_delivery"&&<Truck className="text-basso-goldLight"/>}</div><div className="mt-3 grid gap-2"><input className="h-10 w-full rounded-xl border border-white/15 bg-white/10 px-3 text-sm outline-none" value={customer} onChange={e=>setCustomer(e.target.value)} placeholder="Nome do cliente"/><input className="h-10 w-full rounded-xl border border-white/15 bg-white/10 px-3 text-sm outline-none" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="Telefone" inputMode="tel"/></div></div>
        <div className="border-b p-4"><div className="grid gap-2 sm:grid-cols-[1fr_auto]"><div><p className="label">Base de clientes</p><p className="text-xs text-black/45">Nome ou telefone pode preencher endereço automaticamente.</p></div><button type="button" className="btn-secondary" disabled={searchingCustomer} onClick={searchCustomerBase}><Search size={16}/>{searchingCustomer?"Buscando...":"Buscar"}</button></div>{customerMatches.length>0&&<div className="mt-3 divide-y rounded-xl border">{customerMatches.map(match=><button type="button" key={match.id} className="block w-full p-3 text-left hover:bg-basso-paper" onClick={()=>selectCustomerBase(match)}><strong className="text-sm">{match.name}</strong><p className="text-xs text-black/45">{match.phone}{match.address?` • ${match.address.street}, ${match.address.number} • ${match.address.district}`:""}</p></button>)}</div>}{customerId&&<p className="mt-2 text-xs font-bold text-emerald-700">Cliente vinculado à base.</p>}</div>
        {channel==="own_delivery"&&<><div className="border-b p-4"><p className="label">Origem do pedido</p><div className="grid grid-cols-3 gap-2"><button type="button" className={origin==="whatsapp"?"btn-primary":"btn-secondary"} onClick={()=>setOrigin("whatsapp")}>WhatsApp</button><button type="button" className={origin==="phone"?"btn-primary":"btn-secondary"} onClick={()=>setOrigin("phone")}>Telefone</button><button type="button" className={origin==="counter"?"btn-primary":"btn-secondary"} onClick={()=>setOrigin("counter")}>Balcão</button></div></div><div className="grid gap-2 border-b p-4 sm:grid-cols-2"><input className="input" value={address.cep} onChange={e=>setAddress(a=>({...a,cep:e.target.value}))} placeholder="CEP"/><input className="input" value={address.district} onChange={e=>setAddress(a=>({...a,district:e.target.value}))} placeholder="Bairro"/><input className="input sm:col-span-2" value={address.street} onChange={e=>setAddress(a=>({...a,street:e.target.value}))} placeholder="Rua"/><input className="input" value={address.number} onChange={e=>setAddress(a=>({...a,number:e.target.value}))} placeholder="Número"/><input className="input" value={address.complement||""} onChange={e=>setAddress(a=>({...a,complement:e.target.value}))} placeholder="Complemento"/><input className="input sm:col-span-2" value={address.reference||""} onChange={e=>setAddress(a=>({...a,reference:e.target.value}))} placeholder="Referência"/>{quotingDelivery&&<p className="text-xs font-semibold text-blue-700 sm:col-span-2">Calculando cobertura e taxa…</p>}{deliveryQuote&&<p className="rounded-lg bg-emerald-50 p-2 text-xs font-bold text-emerald-800 sm:col-span-2">Bairro atendido • taxa {currency(deliveryQuote.deliveryFee)}</p>}{deliveryQuoteError&&<p className="rounded-lg bg-red-50 p-2 text-xs font-semibold text-red-800 sm:col-span-2">{deliveryQuoteError}</p>}</div></>}
        {channel==="dine_in"&&<div className="grid gap-3 border-b p-4"><label><span className="label">Mesa</span><select className="input" value={tableNumber} onChange={e=>{setTableNumber(Number(e.target.value));setTabId("")}}>{catalog.tables.map(table=><option key={table.number} value={table.number}>Mesa {table.number} • {table.capacity} lugares</option>)}</select></label><label><span className="label">Comanda existente</span><select className="input" value={tabId} onChange={e=>{setTabId(e.target.value);if(e.target.value)setNewTabName("")}}><option value="">Criar nova comanda</option>{availableTabs.map(tab=><option key={tab.id} value={tab.id}>{tab.name}</option>)}</select></label>{!tabId&&<label><span className="label">Nome da nova comanda</span><input className="input" value={newTabName} onChange={e=>setNewTabName(e.target.value)} placeholder="Ex.: Família Silva" maxLength={120}/></label>}</div>}
        <div className="max-h-72 divide-y divide-black/5 overflow-y-auto">{items.map(item=><div key={item.id} className="p-4"><div className="flex justify-between gap-3"><div><strong className="text-sm">{item.name}</strong><p className="mt-1 text-xs text-basso-wine">{item.kind==="reward"?`Adicionais: ${currency(item.unitPrice)}`:currency(item.unitPrice)}</p></div><button onClick={()=>setItems(current=>current.filter(row=>row.id!==item.id))}><Trash2 size={17} className="text-red-500"/></button></div><div className="mt-3 flex items-center gap-2"><button className="rounded-lg border p-1.5" onClick={()=>setItems(current=>current.map(row=>row.id===item.id?{...row,quantity:Math.max(1,row.quantity-1)}:row))}><Minus size={14}/></button><strong className="w-5 text-center text-sm">{item.quantity}</strong><button disabled={item.kind==="reward"} className="rounded-lg border p-1.5 disabled:opacity-30" onClick={()=>setItems(current=>current.map(row=>row.id===item.id?{...row,quantity:row.quantity+1}:row))}><Plus size={14}/></button></div></div>)}{!items.length&&<p className="p-8 text-center text-sm text-black/40">Nenhum item lançado.</p>}</div>
        <div className="border-t border-black/5 p-5"><div className="mb-3 grid gap-2 sm:grid-cols-2"><label><span className="label">Desconto manual</span><input className="input" value={discount} onChange={e=>setDiscount(e.target.value)} inputMode="decimal" placeholder="0,00"/></label><label><span className="label">Motivo</span><input className="input" value={discountReason} onChange={e=>setDiscountReason(e.target.value)} disabled={!discountCents}/></label></div><div className="mb-4 space-y-1 text-sm"><div className="flex justify-between"><span>Subtotal</span><strong>{currency(subtotal)}</strong></div>{discountCents>0&&<div className="flex justify-between text-red-700"><span>Desconto</span><strong>− {currency(discountCents)}</strong></div>}{channel==="own_delivery"&&<div className="flex justify-between"><span>Taxa de entrega</span><strong>{deliveryQuote?currency(deliveryFee):"—"}</strong></div>}<div className="flex justify-between text-lg"><strong>Total</strong><strong className="text-basso-wine">{currency(displayedTotal)}</strong></div></div>
          <div className="grid grid-cols-2 gap-2"><Pay active={payment==="cash"} onClick={()=>setPayment("cash")} icon={<Banknote size={16}/>} label="Dinheiro"/><Pay active={payment==="pix"} onClick={()=>setPayment("pix")} icon={<Banknote size={16}/>} label="Pix"/><Pay active={payment==="debit"} onClick={()=>setPayment("debit")} icon={<CreditCard size={16}/>} label="Débito"/><Pay active={payment==="credit"} onClick={()=>setPayment("credit")} icon={<CreditCard size={16}/>} label="Crédito"/></div><label className="mt-3 flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={paid} onChange={e=>setPaid(e.target.checked)}/>Pagamento já confirmado</label>{rewardAuth&&!items.some(item=>item.kind==="reward")&&<button className="btn-secondary mt-3 w-full" onClick={()=>setRewardOpen(true)}><Gift size={17}/>Configurar recompensa autorizada</button>}<button disabled={submitting||quotingDelivery} className="btn-primary mt-4 w-full" onClick={finish}>{submitting?"Registrando...":appendTo?"Adicionar à comanda":channel==="own_delivery"?"Finalizar pedido de entrega":"Finalizar e imprimir"}</button>{message&&<p className={`mt-3 rounded-xl p-3 text-xs font-semibold ${message.includes("registrada")?"bg-emerald-50 text-emerald-800":"bg-amber-50 text-amber-900"}`}>{message}</p>}</div>
      </div></aside>
    </div>
    <PizzaBuilder flavor={selectedFlavor} open={Boolean(selectedFlavor)} onClose={()=>setSelectedFlavor(null)} onAdd={addItem}/><RewardBuilder authorization={rewardAuth} open={rewardOpen} onClose={()=>setRewardOpen(false)} onAdd={addItem}/>
  </>;
}

export default function PdvPage(){return <Suspense fallback={<div className="surface p-8 text-center"><p className="font-display text-xl font-bold">Carregando PDV…</p><p className="mt-2 text-sm text-black/50">Preparando cardápio, taxas e canais.</p></div>}><PdvContent/></Suspense>}
function Pay({active,onClick,icon,label}:{active:boolean;onClick:()=>void;icon:React.ReactNode;label:string}){return <button onClick={onClick} className={`flex min-h-10 items-center justify-center gap-2 rounded-xl border text-xs font-bold ${active?"border-basso-wine bg-basso-wine text-white":"border-black/10"}`}>{icon}{label}</button>}
function ChannelButton({active,onClick,icon,label}:{active:boolean;onClick:()=>void;icon:React.ReactNode;label:string}){return <button type="button" onClick={onClick} className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-bold transition ${active?"border-basso-wine bg-basso-wine text-white shadow":"border-black/10 bg-white text-black/60 hover:border-basso-wine/40"}`}>{icon}{label}</button>}
