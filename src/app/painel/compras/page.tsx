"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Loader2,
  PackageCheck,
  Plus,
  RefreshCw,
  Save,
  ShoppingBasket,
  Truck,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/internal/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { currency, isDemoMode, uid } from "@/lib/utils";
import type { PurchaseOrderRecord, SupplierRecord } from "@/types";

type StockProduct = {
  id: string;
  name: string;
  category: string;
  active: boolean;
  inventoryId?: string;
  quantity: number;
  minimumQuantity: number;
  unit: string;
};
type DraftItem = { productId: string; quantity: string; unitCost: string; expiresAt: string };
type ReceiveDraft = Record<string, string>;

const demoSuppliers: SupplierRecord[] = [
  { id: "supplier_demo", name: "Distribuidora Parceira", phone: "(11) 99999-0000", active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];
const demoProducts: StockProduct[] = [
  { id: "bev_coca_2l", name: "Coca-Cola 2 L", category: "beverages", active: true, quantity: 8, minimumQuantity: 6, unit: "unidade" },
  { id: "bev_guarana_2l", name: "Guaraná Antarctica 2 L", category: "beverages", active: true, quantity: 4, minimumQuantity: 6, unit: "unidade" },
  { id: "dessert_pudding", name: "Pudim no Copo", category: "desserts", active: true, quantity: 3, minimumQuantity: 4, unit: "pote" },
];

export default function PurchasesPage() {
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [products, setProducts] = useState<StockProduct[]>([]);
  const [orders, setOrders] = useState<PurchaseOrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [message, setMessage] = useState("");
  const [orderOpen, setOrderOpen] = useState(false);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [receiveOrder, setReceiveOrder] = useState<PurchaseOrderRecord | null>(null);
  const [supplierName, setSupplierName] = useState("");
  const [supplierPhone, setSupplierPhone] = useState("");
  const [supplierDocument, setSupplierDocument] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [expectedAt, setExpectedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<DraftItem[]>([{ productId: "", quantity: "1", unitCost: "", expiresAt: "" }]);
  const [receiveDraft, setReceiveDraft] = useState<ReceiveDraft>({});

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      if (isDemoMode()) {
        setSuppliers(demoSuppliers);
        setProducts(demoProducts);
        setOrders([]);
        return;
      }
      const response = await fetch("/api/purchases", { cache: "no-store" });
      const body = (await response.json()) as { suppliers?: SupplierRecord[]; products?: StockProduct[]; orders?: PurchaseOrderRecord[]; error?: string };
      if (!response.ok) throw new Error(body.error || "Falha ao carregar compras.");
      setSuppliers(body.suppliers || []);
      setProducts(body.products || []);
      setOrders(body.orders || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao carregar compras.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const openValue = useMemo(() => orders.filter((order) => !["received", "cancelled"].includes(order.status)).reduce((sum, order) => sum + order.total, 0), [orders]);
  const lowProducts = useMemo(() => products.filter((product) => product.quantity <= product.minimumQuantity), [products]);
  const draftTotal = useMemo(() => items.reduce((sum, item) => {
    const quantity = Number(item.quantity.replace(",", ".")) || 0;
    const cost = Math.round((Number(item.unitCost.replace(",", ".")) || 0) * 100);
    return sum + quantity * cost;
  }, 0), [items]);

  function resetOrderForm() {
    setSelectedSupplier(""); setExpectedAt(""); setNotes("");
    setItems([{ productId: "", quantity: "1", unitCost: "", expiresAt: "" }]);
  }

  async function createSupplier(event: FormEvent) {
    event.preventDefault();
    setWorking("supplier"); setMessage("");
    try {
      if (supplierName.trim().length < 2) throw new Error("Informe o nome do fornecedor.");
      if (isDemoMode()) {
        setSuppliers((current) => [...current, { id: uid("supplier"), name: supplierName.trim(), phone: supplierPhone.trim() || undefined, document: supplierDocument.trim() || undefined, active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]);
      } else {
        const response = await fetch("/api/purchases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create_supplier", name: supplierName.trim(), phone: supplierPhone.trim() || null, document: supplierDocument.trim() || null }) });
        const body = (await response.json()) as { supplier?: SupplierRecord; error?: string };
        if (!response.ok || !body.supplier) throw new Error(body.error || "Falha ao cadastrar fornecedor.");
        setSuppliers((current) => [...current, body.supplier!].sort((a, b) => a.name.localeCompare(b.name)));
      }
      setSupplierName(""); setSupplierPhone(""); setSupplierDocument(""); setSupplierOpen(false); setMessage("Fornecedor cadastrado com sucesso.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao cadastrar fornecedor."); }
    finally { setWorking(""); }
  }

  async function createOrder(event: FormEvent) {
    event.preventDefault();
    setWorking("order"); setMessage("");
    try {
      const normalizedItems = items.filter((item) => item.productId).map((item) => ({
        productId: item.productId,
        quantity: Number(item.quantity.replace(",", ".")),
        unitCost: Math.round(Number(item.unitCost.replace(",", ".")) * 100),
        expiresAt: item.expiresAt || null,
      }));
      if (!normalizedItems.length || normalizedItems.some((item) => !Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.unitCost) || item.unitCost < 0)) throw new Error("Revise os produtos, quantidades e custos.");
      if (new Set(normalizedItems.map((item) => item.productId)).size !== normalizedItems.length) throw new Error("Não repita o mesmo produto no pedido.");
      if (isDemoMode()) {
        const now = new Date().toISOString();
        const next: PurchaseOrderRecord = {
          id: uid("purchase"), number: Math.max(0, ...orders.map((order) => order.number)) + 1,
          supplierId: selectedSupplier || undefined, supplierName: suppliers.find((supplier) => supplier.id === selectedSupplier)?.name,
          status: "draft", expectedAt: expectedAt || undefined, total: draftTotal, notes: notes.trim() || undefined,
          createdAt: now, updatedAt: now,
          items: normalizedItems.map((item) => ({ id: uid("purchase_item"), productId: item.productId, productName: products.find((product) => product.id === item.productId)?.name || item.productId, orderedQuantity: item.quantity, receivedQuantity: 0, unitCost: item.unitCost, expiresAt: item.expiresAt || undefined })),
        };
        setOrders((current) => [next, ...current]);
      } else {
        const response = await fetch("/api/purchases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create_order", supplierId: selectedSupplier || null, expectedAt: expectedAt || null, notes: notes.trim() || null, items: normalizedItems }) });
        const body = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(body.error || "Falha ao criar pedido de compra.");
        await load();
      }
      resetOrderForm(); setOrderOpen(false); setMessage("Pedido de compra criado. Confirme o envio ao fornecedor quando estiver pronto.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao criar pedido de compra."); }
    finally { setWorking(""); }
  }

  async function updateOrder(order: PurchaseOrderRecord, action: "mark_ordered" | "cancel") {
    const reason = action === "cancel" ? window.prompt("Informe o motivo do cancelamento:") : "";
    if (action === "cancel" && (!reason || reason.trim().length < 2)) return;
    setWorking(order.id); setMessage("");
    try {
      if (isDemoMode()) setOrders((current) => current.map((item) => item.id === order.id ? { ...item, status: action === "mark_ordered" ? "ordered" : "cancelled", updatedAt: new Date().toISOString() } : item));
      else {
        const response = await fetch(`/api/purchases/${order.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action === "cancel" ? { action, reason } : { action }) });
        const body = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(body.error || "Falha ao atualizar compra.");
        await load();
      }
      setMessage(action === "mark_ordered" ? "Pedido marcado como enviado ao fornecedor." : "Pedido de compra cancelado.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao atualizar compra."); }
    finally { setWorking(""); }
  }

  function openReceive(order: PurchaseOrderRecord) {
    setReceiveOrder(order);
    setReceiveDraft(Object.fromEntries(order.items.filter((item) => item.receivedQuantity < item.orderedQuantity).map((item) => [item.id, String(item.orderedQuantity - item.receivedQuantity)])));
  }

  async function receive(event: FormEvent) {
    event.preventDefault();
    if (!receiveOrder) return;
    const receivedItems = receiveOrder.items.map((item) => ({ itemId: item.id, receivedQuantity: Number((receiveDraft[item.id] || "0").replace(",", ".")), expiresAt: item.expiresAt || null })).filter((item) => item.receivedQuantity > 0);
    if (!receivedItems.length) { setMessage("Informe ao menos uma quantidade recebida."); return; }
    setWorking("receive"); setMessage("");
    try {
      if (isDemoMode()) {
        setOrders((current) => current.map((order) => {
          if (order.id !== receiveOrder.id) return order;
          const updatedItems = order.items.map((item) => {
            const entry = receivedItems.find((candidate) => candidate.itemId === item.id);
            return entry ? { ...item, receivedQuantity: Math.min(item.orderedQuantity, item.receivedQuantity + entry.receivedQuantity) } : item;
          });
          const complete = updatedItems.every((item) => item.receivedQuantity >= item.orderedQuantity);
          return { ...order, items: updatedItems, status: complete ? "received" : "partially_received", receivedAt: complete ? new Date().toISOString() : undefined, updatedAt: new Date().toISOString() };
        }));
      } else {
        const response = await fetch(`/api/purchases/${receiveOrder.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "receive", items: receivedItems }) });
        const body = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(body.error || "Falha ao receber compra.");
        await load();
      }
      setReceiveOrder(null); setReceiveDraft({}); setMessage("Recebimento registrado e estoque atualizado.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao receber compra."); }
    finally { setWorking(""); }
  }

  return <>
    <PageHeader title="Compras e fornecedores" description="Planeje reposições de bebidas e sobremesas, registre fornecedores e dê entrada no estoque com histórico e auditoria." icon={ShoppingBasket} actions={<><button className="btn-secondary" onClick={load} disabled={loading}><RefreshCw size={17}/>{loading ? "Atualizando..." : "Atualizar"}</button><button className="btn-secondary" onClick={()=>setSupplierOpen(true)}><Building2 size={17}/>Fornecedor</button><button className="btn-primary" onClick={()=>setOrderOpen(true)}><Plus size={17}/>Novo pedido</button></>} />
    {message && <div className="mb-5 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm font-semibold text-blue-800">{message}</div>}

    <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric icon={<ClipboardList/>} label="Pedidos em aberto" value={orders.filter((order)=>!["received","cancelled"].includes(order.status)).length} detail={currency(openValue)} />
      <Metric icon={<Truck/>} label="Enviados" value={orders.filter((order)=>order.status==="ordered").length} detail="aguardando fornecedor" />
      <Metric icon={<PackageCheck/>} label="Recebimentos parciais" value={orders.filter((order)=>order.status==="partially_received").length} detail="exigem conferência" />
      <Metric icon={<ShoppingBasket/>} label="Reposição sugerida" value={lowProducts.length} detail="itens no mínimo" />
    </section>

    <div className="grid gap-6 xl:grid-cols-[1.4fr_.7fr]">
      <section className="surface overflow-hidden">
        <div className="border-b border-black/5 p-5"><h2 className="font-display text-2xl font-bold">Pedidos de compra</h2><p className="text-sm text-black/45">Recebimentos atualizam somente bebidas e sobremesas controladas.</p></div>
        <div className="divide-y divide-black/5">
          {loading && <div className="grid min-h-44 place-items-center"><Loader2 className="animate-spin text-basso-wine"/></div>}
          {!loading && !orders.length && <div className="p-8 text-center text-sm text-black/45">Nenhum pedido de compra cadastrado.</div>}
          {orders.map((order)=><article key={order.id} className="p-5">
            <div className="flex flex-wrap items-start gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-display text-xl font-bold">Compra #{order.number}</h3><Status status={order.status}/></div><p className="mt-1 text-sm text-black/50">{order.supplierName || "Fornecedor não informado"}{order.expectedAt ? ` • previsão ${new Date(`${order.expectedAt}T12:00:00`).toLocaleDateString("pt-BR")}` : ""}</p></div><strong className="text-lg text-basso-wine">{currency(order.total)}</strong></div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">{order.items.map((item)=><div key={item.id} className="rounded-xl bg-basso-paper p-3 text-sm"><strong>{item.productName}</strong><p className="mt-1 text-xs text-black/50">Pedido {item.orderedQuantity} • recebido {item.receivedQuantity} • {currency(item.unitCost)} cada</p></div>)}</div>
            <div className="mt-4 flex flex-wrap gap-2">{order.status==="draft"&&<button className="btn-secondary" disabled={working===order.id} onClick={()=>updateOrder(order,"mark_ordered")}><Truck size={16}/>Marcar como enviado</button>}{["ordered","partially_received"].includes(order.status)&&<button className="btn-primary" onClick={()=>openReceive(order)}><PackageCheck size={16}/>Receber produtos</button>}{!["received","cancelled"].includes(order.status)&&<button className="btn-ghost text-red-700" disabled={working===order.id} onClick={()=>updateOrder(order,"cancel")}><X size={16}/>Cancelar</button>}</div>
          </article>)}
        </div>
      </section>

      <aside className="space-y-5">
        <section className="surface p-5"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-700"><ShoppingBasket size={19}/></span><div><h2 className="font-display text-xl font-bold">Reposição sugerida</h2><p className="text-xs text-black/45">Saldo igual ou abaixo do mínimo.</p></div></div><div className="mt-4 space-y-2">{lowProducts.map((product)=><div key={product.id} className="flex items-center justify-between rounded-xl bg-basso-paper p-3"><div><strong className="text-sm">{product.name}</strong><p className="text-[11px] text-black/45">mínimo {product.minimumQuantity} {product.unit}</p></div><span className="rounded-full bg-red-50 px-2 py-1 text-xs font-black text-red-700">{product.quantity}</span></div>)}{!lowProducts.length&&<p className="rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">Nenhum item abaixo do mínimo.</p>}</div></section>
        <section className="surface p-5"><h2 className="font-display text-xl font-bold">Fornecedores ativos</h2><div className="mt-3 space-y-2">{suppliers.filter((supplier)=>supplier.active).map((supplier)=><div key={supplier.id} className="rounded-xl border border-black/5 p-3"><strong className="text-sm">{supplier.name}</strong><p className="text-xs text-black/45">{supplier.phone || supplier.document || "Sem contato cadastrado"}</p></div>)}{!suppliers.length&&<p className="text-sm text-black/45">Cadastre o primeiro fornecedor.</p>}</div></section>
      </aside>
    </div>

    <Modal open={supplierOpen} onClose={()=>setSupplierOpen(false)} title="Cadastrar fornecedor"><form onSubmit={createSupplier} className="space-y-4"><Field label="Nome *" value={supplierName} onChange={setSupplierName}/><div className="grid gap-4 sm:grid-cols-2"><Field label="Telefone" value={supplierPhone} onChange={setSupplierPhone}/><Field label="CNPJ/CPF" value={supplierDocument} onChange={setSupplierDocument}/></div><button className="btn-primary w-full" type="submit" disabled={working==="supplier"}>{working==="supplier"?<Loader2 size={17} className="animate-spin"/>:<Save size={17}/>}Salvar fornecedor</button></form></Modal>

    <Modal open={orderOpen} onClose={()=>setOrderOpen(false)} title="Novo pedido de compra"><form onSubmit={createOrder} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><label><span className="label">Fornecedor</span><select className="input" value={selectedSupplier} onChange={(event)=>setSelectedSupplier(event.target.value)}><option value="">Não informado</option>{suppliers.filter((supplier)=>supplier.active).map((supplier)=><option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label><label><span className="label">Previsão de entrega</span><input className="input" type="date" value={expectedAt} onChange={(event)=>setExpectedAt(event.target.value)}/></label></div><div className="space-y-3">{items.map((item,index)=><div key={index} className="rounded-xl border border-black/10 p-3"><div className="grid gap-3 sm:grid-cols-[1.5fr_.55fr_.7fr_auto]"><label><span className="label">Produto</span><select className="input" value={item.productId} onChange={(event)=>setItems((current)=>current.map((candidate,position)=>position===index?{...candidate,productId:event.target.value}:candidate))}><option value="">Selecione</option>{products.map((product)=><option key={product.id} value={product.id}>{product.name}</option>)}</select></label><Field label="Quantidade" value={item.quantity} onChange={(value)=>setItems((current)=>current.map((candidate,position)=>position===index?{...candidate,quantity:value}:candidate))}/><Field label="Custo unit. (R$)" value={item.unitCost} onChange={(value)=>setItems((current)=>current.map((candidate,position)=>position===index?{...candidate,unitCost:value}:candidate))}/><button type="button" className="btn-ghost self-end" aria-label="Remover item" disabled={items.length===1} onClick={()=>setItems((current)=>current.filter((_,position)=>position!==index))}><X size={17}/></button></div></div>)}</div><button type="button" className="btn-secondary" onClick={()=>setItems((current)=>[...current,{productId:"",quantity:"1",unitCost:"",expiresAt:""}])}><Plus size={16}/>Adicionar produto</button><label><span className="label">Observações</span><textarea className="input min-h-20" value={notes} onChange={(event)=>setNotes(event.target.value)}/></label><div className="flex items-center justify-between rounded-xl bg-basso-paper p-4"><span className="font-bold">Total estimado</span><strong className="text-xl text-basso-wine">{currency(draftTotal)}</strong></div><button className="btn-primary w-full" type="submit" disabled={working==="order"}>{working==="order"?<Loader2 size={17} className="animate-spin"/>:<Save size={17}/>}Criar pedido de compra</button></form></Modal>

    <Modal open={Boolean(receiveOrder)} onClose={()=>setReceiveOrder(null)} title={receiveOrder?`Receber compra #${receiveOrder.number}`:"Receber compra"}>{receiveOrder&&<form onSubmit={receive} className="space-y-3"><p className="text-sm text-black/55">Informe somente o que chegou agora. O sistema impedirá recebimento acima da quantidade pedida.</p>{receiveOrder.items.filter((item)=>item.receivedQuantity<item.orderedQuantity).map((item)=><label key={item.id} className="block rounded-xl border border-black/10 p-3"><div className="flex items-center justify-between gap-3"><div><strong className="text-sm">{item.productName}</strong><p className="text-xs text-black/45">Falta receber {item.orderedQuantity-item.receivedQuantity}</p></div><input className="input max-w-28" inputMode="decimal" value={receiveDraft[item.id]||""} onChange={(event)=>setReceiveDraft((current)=>({...current,[item.id]:event.target.value}))}/></div></label>)}<button className="btn-primary w-full" type="submit" disabled={working==="receive"}>{working==="receive"?<Loader2 size={17} className="animate-spin"/>:<CheckCircle2 size={17}/>}Confirmar recebimento</button></form>}</Modal>
  </>;
}

function Metric({icon,label,value,detail}:{icon:React.ReactNode;label:string;value:number;detail:string}){return <article className="surface p-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-basso-cream text-basso-wine">{icon}</span><div><p className="text-xs font-bold uppercase tracking-wide text-black/40">{label}</p><div className="flex items-end gap-2"><strong className="text-2xl">{value}</strong><span className="pb-1 text-xs text-black/45">{detail}</span></div></div></div></article>}
function Field({label,value,onChange}:{label:string;value:string;onChange:(value:string)=>void}){return <label><span className="label">{label}</span><input className="input" value={value} onChange={(event)=>onChange(event.target.value)}/></label>}
function Status({status}:{status:PurchaseOrderRecord["status"]}){const label={draft:"Rascunho",ordered:"Enviado",partially_received:"Parcial",received:"Recebido",cancelled:"Cancelado"}[status];const tone=status==="received"?"bg-emerald-50 text-emerald-700":status==="cancelled"?"bg-red-50 text-red-700":status==="partially_received"?"bg-amber-50 text-amber-800":status==="ordered"?"bg-blue-50 text-blue-700":"bg-stone-100 text-stone-600";return <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${tone}`}>{label}</span>}
