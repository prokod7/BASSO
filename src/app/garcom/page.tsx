"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { BellRing, Check, ChefHat, ChevronLeft, ClipboardList, Home, Loader2, Minus, Plus, RefreshCw, Search, Send, ShoppingBag, Table2, Trash2, UserRound } from "lucide-react";
import { OperationalHydrator } from "@/components/internal/OperationalHydrator";
import { PizzaBuilder } from "@/components/public/PizzaBuilder";
import { allProducts, catalog } from "@/lib/catalog";
import { demoActions } from "@/lib/demo-store";
import { useStableDemoState } from "@/lib/stable-store";
import { apiJson, formatApiError, requestOperationalRefresh } from "@/lib/client/api";
import { currency, isDemoMode, normalizeSearchText, uid } from "@/lib/utils";
import type { CartItem, Flavor, Order } from "@/types";

type Screen = "tables" | "order" | "ready";
type OrderWithService = Order & { servedAt?: string };

export default function WaiterMobilePage() {
  const store = useStableDemoState((state) => state);
  const [screen, setScreen] = useState<Screen>("tables");
  const [tableNumber, setTableNumber] = useState<number | null>(null);
  const [tabId, setTabId] = useState("");
  const [newTabName, setNewTabName] = useState("");
  const [people, setPeople] = useState("1");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<CartItem[]>([]);
  const [selectedFlavor, setSelectedFlavor] = useState<Flavor | null>(null);
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState("");

  const table = tableNumber == null ? null : store.tables.find((item) => item.number === tableNumber) || null;
  const activeTabs = table?.tabs.filter((tab) => tab.status === "open" || tab.status === "partial") || [];
  const selectedTab = activeTabs.find((tab) => tab.id === tabId) || null;
  const readyOrders = useMemo(() => store.orders.filter((order) => (order.channel === "dine_in" || order.channel === "table_qr") && order.status === "ready"), [store.orders]);
  const normalizedQuery = normalizeSearchText(query);
  const flavors = useMemo(() => catalog.flavors.filter((flavor) => flavor.active && (!normalizedQuery || normalizeSearchText(`${flavor.name} ${flavor.description}`).includes(normalizedQuery))), [normalizedQuery]);
  const products = useMemo(() => allProducts.filter((product) => product.active && (!normalizedQuery || normalizeSearchText(`${product.name} ${product.description}`).includes(normalizedQuery))), [normalizedQuery]);
  const total = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  function chooseTable(number: number) {
    const selected = store.tables.find((item) => item.number === number);
    setTableNumber(number);
    setTabId(selected?.tabs.find((tab) => tab.status === "open" || tab.status === "partial")?.id || "");
    setItems([]);
    setMessage("");
    setScreen("order");
  }

  async function openTab(event: FormEvent) {
    event.preventDefault();
    if (!tableNumber) return;
    const name = newTabName.trim();
    if (!name) { setMessage("Informe o nome da comanda."); return; }
    const count = Math.max(1, Number(people) || 1);
    setWorking("tab"); setMessage("");
    try {
      let id: string;
      if (isDemoMode()) id = demoActions.openTab(tableNumber, name, count, "Garçom");
      else {
        const body = await apiJson<{ id: string }>(`/api/tables/${tableNumber}/tabs`, { method: "POST", body: JSON.stringify({ name, people: count }) });
        id = body.id;
        requestOperationalRefresh();
      }
      setTabId(id);
      setNewTabName("");
      setMessage(`Comanda ${name} aberta.`);
    } catch (error) { setMessage(formatApiError(error, "Falha ao abrir comanda.")); }
    finally { setWorking(""); }
  }

  function addProduct(productId: string) {
    const product = allProducts.find((entry) => entry.id === productId && entry.active);
    if (!product) return;
    setItems((current) => {
      const existing = current.find((item) => item.kind === "product" && item.productId === product.id);
      if (existing) return current.map((item) => item.id === existing.id ? { ...item, quantity: item.quantity + 1 } : item);
      return [...current, { id: uid("waiter"), kind: "product", name: product.name, quantity: 1, unitPrice: product.price, productId: product.id, image: product.image }];
    });
  }

  function changeQuantity(id: string, delta: number) {
    setItems((current) => current.flatMap((item) => {
      if (item.id !== id) return [item];
      const quantity = item.quantity + delta;
      return quantity > 0 ? [{ ...item, quantity }] : [];
    }));
  }

  async function sendOrder() {
    if (!tableNumber) { setMessage("Escolha uma mesa."); return; }
    if (!tabId) { setMessage("Selecione ou abra uma comanda antes de lançar o pedido."); return; }
    if (!items.length) { setMessage("Adicione pelo menos um item."); return; }
    setWorking("order"); setMessage("");
    try {
      const now = new Date().toISOString();
      const sourceIdempotencyKey = uid("waiter-key");
      const localNumber = Math.max(1054, ...store.orders.map((order) => Number(order.number) || 0)) + 1;
      const order: Order = {
        id: uid("waiter-order"),
        number: localNumber,
        channel: "dine_in",
        status: "confirmed",
        paymentStatus: "pending",
        customerName: selectedTab?.name ? `Mesa ${tableNumber} • ${selectedTab.name}` : `Mesa ${tableNumber}`,
        customerPhone: "",
        tableNumber,
        tabId,
        tabName: selectedTab?.name || newTabName || "Comanda",
        items,
        subtotal: total,
        discount: 0,
        deliveryFee: 0,
        total,
        paymentMethod: "cash",
        createdAt: now,
        updatedAt: now,
        sourceIdempotencyKey,
        origin: "table",
      };
      let finalNumber = localNumber;
      if (isDemoMode()) demoActions.addOrderLocal(order, "Garçom");
      else {
        const response = await apiJson<{ number?: number }>("/api/internal-orders", { method: "POST", headers: { "Idempotency-Key": sourceIdempotencyKey }, body: JSON.stringify(order) });
        finalNumber = Number(response.number || localNumber);
        requestOperationalRefresh();
      }
      setItems([]);
      setMessage(`Pedido #${finalNumber} enviado para produção.`);
    } catch (error) { setMessage(formatApiError(error, "Falha ao enviar pedido para produção.")); }
    finally { setWorking(""); }
  }

  async function markServed(order: OrderWithService) {
    setWorking(`served-${order.id}`); setMessage("");
    try {
      if (isDemoMode()) demoActions.patchOrder(order.id, { internalSummary: "Pedido servido à mesa" }, "Garçom");
      else {
        await apiJson(`/api/orders/${order.id}/served`, { method: "POST" });
        requestOperationalRefresh();
      }
      setMessage(`Pedido #${order.number} marcado como servido. A comanda continua aberta para pagamento.`);
    } catch (error) { setMessage(formatApiError(error, "Falha ao registrar serviço da mesa.")); }
    finally { setWorking(""); }
  }

  return <div className="min-h-dvh bg-[#f5f2eb] pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
    <OperationalHydrator />
    <header className="sticky top-0 z-30 border-b border-black/5 bg-white/95 px-4 pb-3 pt-[calc(.75rem+env(safe-area-inset-top))] backdrop-blur-xl">
      <div className="flex items-center gap-3">
        {screen !== "tables" ? <button className="grid h-11 w-11 place-items-center rounded-xl bg-black/5" onClick={() => setScreen("tables")} aria-label="Voltar para mesas"><ChevronLeft /></button> : <span className="grid h-11 w-11 place-items-center rounded-xl bg-basso-wine text-white"><UserRound /></span>}
        <div className="min-w-0 flex-1"><p className="font-display text-xl font-black">PedidoPro Garçom</p><p className="text-xs text-black/45">Basso • operação mobile</p></div>
        <button className="grid h-11 w-11 place-items-center rounded-xl border bg-white" onClick={() => requestOperationalRefresh()} aria-label="Atualizar"><RefreshCw size={18} /></button>
        <Link href="/painel" className="grid h-11 w-11 place-items-center rounded-xl border bg-white" aria-label="Painel"><Home size={18} /></Link>
      </div>
    </header>

    <main className="mx-auto max-w-xl p-4">
      {message && <p className={`mb-4 rounded-2xl p-4 text-sm font-semibold ${/falha|erro|informe/i.test(message) ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-800"}`}>{message}</p>}

      {screen === "tables" && <>
        {readyOrders.length > 0 && <button className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left" onClick={() => setScreen("ready")}><BellRing className="text-amber-800" /><div className="flex-1"><strong className="text-amber-900">{readyOrders.length} pedido(s) pronto(s)</strong><p className="text-xs text-amber-700">Toque para ver e retirar.</p></div><Plus className="rotate-45 text-amber-700" /></button>}
        <div className="mb-3 flex items-end justify-between"><div><p className="text-xs font-black uppercase tracking-[.16em] text-basso-wine">Salão</p><h1 className="font-display text-3xl font-black">Escolha a mesa</h1></div><span className="text-xs text-black/40">{store.tables.filter((entry) => entry.status !== "free").length} ocupadas</span></div>
        <div className="grid grid-cols-2 gap-3">{store.tables.map((entry) => <button key={entry.number} onClick={() => chooseTable(entry.number)} className={`min-h-36 rounded-3xl border p-4 text-left shadow-sm ${entry.status === "free" ? "border-emerald-200 bg-emerald-50" : entry.status === "partial" ? "border-blue-200 bg-blue-50" : "border-basso-wine/20 bg-white"}`}><div className="flex items-center justify-between"><Table2 className="text-basso-wine" /><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${entry.status === "free" ? "bg-emerald-100 text-emerald-800" : entry.status === "partial" ? "bg-blue-100 text-blue-800" : "bg-basso-wine/10 text-basso-wine"}`}>{entry.status === "free" ? "Livre" : entry.status === "partial" ? "Parcial" : "Ocupada"}</span></div><p className="mt-4 font-display text-3xl font-black">Mesa {entry.number}</p><p className="mt-1 text-xs text-black/45">{entry.capacity} lugares • {entry.tabs.length} comanda(s)</p></button>)}</div>
      </>}

      {screen === "order" && tableNumber && <>
        <div className="mb-4 flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[.16em] text-basso-wine">Mesa {tableNumber}</p><h1 className="font-display text-3xl font-black">Comanda e pedido</h1></div><span className="rounded-full bg-white px-3 py-2 text-xs font-bold">{table?.status === "free" ? "Livre" : "Em atendimento"}</span></div>

        <section className="surface mb-4 p-4"><p className="label">Comanda</p>{activeTabs.length ? <select className="input mt-2 text-base" value={tabId} onChange={(event) => setTabId(event.target.value)}><option value="">Selecione</option>{activeTabs.map((tab) => <option key={tab.id} value={tab.id}>{tab.name} • {currency(tab.totalCents)}</option>)}</select> : <p className="mt-1 text-sm text-black/50">Nenhuma comanda aberta nesta mesa.</p>}
          <form onSubmit={openTab} className="mt-3 grid gap-2"><input className="input text-base" value={newTabName} onChange={(event) => setNewTabName(event.target.value)} placeholder="Nome da nova comanda" /><div className="grid grid-cols-[90px_1fr] gap-2"><input className="input text-base" type="number" min="1" max={table?.capacity || 5} value={people} onChange={(event) => setPeople(event.target.value)} /><button type="submit" className="btn-secondary" disabled={working === "tab"}>{working === "tab" ? <Loader2 className="animate-spin" size={17} /> : <Plus size={17} />}Abrir nova comanda</button></div></form>
        </section>

        <label className="relative mb-4 block"><Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30" /><input className="input h-12 pl-10 text-base" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar sabor, bebida ou sobremesa" /></label>

        <section className="mb-5"><div className="mb-2 flex items-center gap-2"><ChefHat size={18} className="text-basso-wine" /><h2 className="font-display text-xl font-black">Pizzas</h2></div><div className="grid grid-cols-2 gap-2">{flavors.slice(0, normalizedQuery ? 30 : 12).map((flavor) => <button key={flavor.id} onClick={() => setSelectedFlavor(flavor)} className="surface min-h-24 p-3 text-left"><span className="text-[9px] font-black uppercase text-black/35">{flavor.category}</span><p className="mt-1 line-clamp-2 font-display font-bold">{flavor.name}</p><p className="mt-2 text-xs font-bold text-basso-wine">A partir de {currency(Math.min(flavor.priceBroto, flavor.priceGrande))}</p></button>)}</div></section>

        <section className="mb-5"><div className="mb-2 flex items-center gap-2"><ShoppingBag size={18} className="text-basso-wine" /><h2 className="font-display text-xl font-black">Bebidas e sobremesas</h2></div><div className="grid grid-cols-2 gap-2">{products.slice(0, normalizedQuery ? 30 : 16).map((product) => <button key={product.id} onClick={() => addProduct(product.id)} className="surface min-h-20 p-3 text-left"><p className="line-clamp-2 text-sm font-bold">{product.name}</p><p className="mt-2 text-xs font-bold text-basso-wine">{currency(product.price)}</p></button>)}</div></section>

        <section className="surface overflow-hidden"><div className="flex items-center justify-between bg-basso-black p-4 text-white"><div><p className="text-xs text-white/50">Pedido atual</p><p className="font-display text-xl font-black">{items.length} item(ns)</p></div><strong>{currency(total)}</strong></div><div className="divide-y">{items.map((item) => <div key={item.id} className="flex items-center gap-3 p-3"><div className="min-w-0 flex-1"><p className="text-sm font-bold">{item.name}</p><p className="text-xs text-black/45">{currency(item.unitPrice * item.quantity)}</p></div><button className="grid h-9 w-9 place-items-center rounded-lg border" onClick={() => changeQuantity(item.id, -1)}><Minus size={14} /></button><span className="w-5 text-center text-sm font-black">{item.quantity}</span><button className="grid h-9 w-9 place-items-center rounded-lg border" onClick={() => changeQuantity(item.id, 1)}><Plus size={14} /></button><button className="grid h-9 w-9 place-items-center rounded-lg text-red-700" onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}><Trash2 size={15} /></button></div>)}{!items.length && <p className="p-5 text-center text-sm text-black/40">Nenhum item lançado ainda.</p>}</div><div className="p-4"><button className="btn-primary min-h-12 w-full" disabled={working === "order" || !items.length || !tabId} onClick={() => void sendOrder()}>{working === "order" ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}Enviar para produção</button></div></section>
      </>}

      {screen === "ready" && <><div className="mb-4"><p className="text-xs font-black uppercase tracking-[.16em] text-basso-wine">Produção</p><h1 className="font-display text-3xl font-black">Pedidos prontos</h1></div><div className="space-y-3">{readyOrders.map((order) => { const servedAt = (order as OrderWithService).servedAt; return <article key={order.id} className="surface p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase text-basso-wine">Pedido #{order.number}</p><h2 className="mt-1 font-display text-2xl font-black">Mesa {order.tableNumber || "—"}</h2><p className="mt-1 text-sm text-black/45">{order.customerName}</p></div>{servedAt ? <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">Servido</span> : <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">Retirar</span>}</div><div className="mt-3 space-y-1">{order.items.map((item) => <p key={item.id} className="text-sm"><strong>{item.quantity}×</strong> {item.name}</p>)}</div><button className="btn-primary mt-4 w-full" disabled={Boolean(servedAt) || working === `served-${order.id}`} onClick={() => void markServed(order as OrderWithService)}>{working === `served-${order.id}` ? <Loader2 className="animate-spin" size={17} /> : <Check size={17} />}{servedAt ? "Já servido" : "Marcar como servido"}</button></article>; })}{!readyOrders.length && <div className="surface p-10 text-center"><Check className="mx-auto text-emerald-600" size={36} /><p className="mt-3 font-bold">Nenhum pedido aguardando retirada.</p></div>}</div></>}
    </main>

    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"><div className="mx-auto grid max-w-xl grid-cols-3"><NavButton active={screen === "tables"} onClick={() => setScreen("tables")} icon={<Table2 size={20} />} label="Mesas" /><NavButton active={screen === "order"} disabled={!tableNumber} onClick={() => setScreen("order")} icon={<ClipboardList size={20} />} label="Pedido" /><NavButton active={screen === "ready"} onClick={() => setScreen("ready")} icon={<BellRing size={20} />} label={`Prontos${readyOrders.length ? ` (${readyOrders.length})` : ""}`} /></div></nav>

    <PizzaBuilder flavor={selectedFlavor} open={Boolean(selectedFlavor)} onClose={() => setSelectedFlavor(null)} onAdd={(item) => { setItems((current) => [...current, item]); setSelectedFlavor(null); }} />
  </div>;
}

function NavButton({ active, disabled, onClick, icon, label }: { active: boolean; disabled?: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return <button disabled={disabled} onClick={onClick} className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-bold disabled:opacity-30 ${active ? "text-basso-wine" : "text-black/45"}`}>{icon}<span>{label}</span></button>;
}
