"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bike,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Copy,
  CreditCard,
  Edit3,
  ExternalLink,
  History,
  Loader2,
  MapPin,
  MessageCircle,
  Minus,
  Package,
  Phone,
  Plus,
  Printer,
  ReceiptText,
  RefreshCw,
  Save,
  ShieldAlert,
  StickyNote,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { allowedStatuses, channelLabel, statusLabel } from "@/lib/order-validation";
import { currency, isDemoMode, shortDateTime, uid } from "@/lib/utils";
import { demoActions, useDemoState } from "@/lib/demo-store";
import type {
  CommunicationTemplate,
  ManagedOrderItem,
  Order,
  OrderDetail,
  OrderIncident,
  OrderPaymentRecord,
  OrderCommunicationLog,
  OrderInternalNote,
  OrderStatus,
  PaymentMethod,
  Driver,
  OrderEditLock,
} from "@/types";

const tabs = ["resumo", "itens", "pagamento", "comunicacao", "ocorrencias", "historico"] as const;
type Tab = (typeof tabs)[number];

const tabLabels: Record<Tab, string> = {
  resumo: "Resumo",
  itens: "Itens",
  pagamento: "Pagamento",
  comunicacao: "Comunicação",
  ocorrencias: "Ocorrências",
  historico: "Histórico",
};

const paymentLabels: Record<PaymentMethod, string> = {
  pix: "Pix",
  cash: "Dinheiro",
  debit: "Débito",
  credit: "Crédito",
  meal_voucher: "Vale-refeição",
  food_voucher: "Vale-alimentação",
};

const fallbackTemplates: CommunicationTemplate[] = [
  { key: "confirmation", name: "Pedido confirmado", body: "Olá, {cliente}! Seu pedido #{numero} foi confirmado pela La Forneria Basso.", active: true, sortOrder: 10 },
  { key: "preparing", name: "Em preparo", body: "Olá, {cliente}! Seu pedido #{numero} já está em preparo.", active: true, sortOrder: 20 },
  { key: "ready", name: "Pedido pronto", body: "Olá, {cliente}! Seu pedido #{numero} está pronto.", active: true, sortOrder: 30 },
  { key: "out_for_delivery", name: "Saiu para entrega", body: "Olá, {cliente}! Seu pedido #{numero} saiu para entrega.", active: true, sortOrder: 40 },
  { key: "address", name: "Confirmar endereço", body: "Olá, {cliente}! Precisamos confirmar o endereço do pedido #{numero}: {endereco}.", active: true, sortOrder: 50 },
  { key: "delay", name: "Informar atraso", body: "Olá, {cliente}! O pedido #{numero} teve um pequeno atraso. A nova previsão é {previsao}.", active: true, sortOrder: 60 },
  { key: "cancelled", name: "Cancelamento", body: "Olá, {cliente}. Precisamos falar sobre o cancelamento do pedido #{numero}.", active: true, sortOrder: 90 },
  { key: "thanks", name: "Agradecimento", body: "Obrigado pelo pedido #{numero}, {cliente}! La Forneria Basso.", active: true, sortOrder: 100 },
];

function detailFromOrder(order: Order): OrderDetail {
  const items: ManagedOrderItem[] = order.items.map((item) => ({ ...item, sector: item.kind === "product" ? "bar" : "kitchen", productionStatus: "queued" }));
  const paidAmount = order.paymentStatus === "paid" ? order.total : 0;
  return {
    ...order,
    items,
    priority: order.priority || "normal",
    paidAmount,
    balanceDue: Math.max(0, order.total - paidAmount),
    timeline: [{ id: `demo_${order.id}`, toStatus: order.status, source: "demo", actor: "Equipe", createdAt: order.updatedAt }],
    payments: order.paymentStatus === "paid" ? [{ id: `pay_${order.id}`, method: order.paymentMethod, status: "paid", amount: order.total, createdBy: "Equipe", createdAt: order.updatedAt } as OrderPaymentRecord] : [],
    internalNotes: [],
    incidents: [],
    communications: [],
    printJobs: [],
  };
}

function dispatchRefresh() {
  window.dispatchEvent(new Event("lfb:refresh-operation"));
}

export function OrderDetailPanel({ orderId, onClose }: { orderId: string | null; onClose: () => void }) {
  const demoOrder = useDemoState((state) => state.orders.find((order) => order.id === orderId));
  const drivers = useDemoState((state) => state.drivers);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [tab, setTab] = useState<Tab>("resumo");
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [templates, setTemplates] = useState<CommunicationTemplate[]>(fallbackTemplates);
  const [editLock, setEditLock] = useState<OrderEditLock | null>(null);
  const [lockNotice, setLockNotice] = useState("");

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setFeedback(null);
    try {
      if (isDemoMode()) {
        if (!demoOrder) throw new Error("Pedido não encontrado.");
        setOrder((current) => current?.id === demoOrder.id ? { ...current, ...demoOrder, items: current.items } : detailFromOrder(demoOrder));
      } else {
        const response = await fetch(`/api/orders/${orderId}`, { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Falha ao carregar o pedido.");
        setOrder(body.order);
      }
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Falha ao carregar o pedido." });
    } finally {
      setLoading(false);
    }
  }, [demoOrder, orderId]);

  useEffect(() => {
    if (!orderId) return;
    setTab("resumo");
    setOrder(null);
    load();
    if (!isDemoMode()) {
      fetch(`/api/orders/${orderId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "mark_viewed" }) }).catch(() => undefined);
      fetch(`/api/orders/${orderId}/communications`, { cache: "no-store" }).then(async (response) => {
        const body = await response.json().catch(() => null);
        if (response.ok && Array.isArray(body?.templates)) setTemplates(body.templates);
      }).catch(() => undefined);
    }
  }, [load, orderId]);

  useEffect(() => {
    if (!orderId || isDemoMode()) { setEditLock(orderId ? { acquired: true, holderId: "demo", holderLabel: "Gestor Demo" } : null); return; }
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const acquire = async () => {
      try {
        const response = await fetch(`/api/orders/${orderId}/lock`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ttlSeconds: 180 }) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Falha ao reservar edição.");
        if (!cancelled) { setEditLock(body); setLockNotice(body.acquired ? "" : `${body.holderLabel || "Outro usuário"} está editando esta comanda.`); }
      } catch (cause) {
        if (!cancelled) { setEditLock(null); setLockNotice(cause instanceof Error ? `Controle de concorrência indisponível: ${cause.message}` : "Controle de concorrência indisponível."); }
      }
    };
    void acquire();
    timer = setInterval(() => void acquire(), 90_000);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      fetch(`/api/orders/${orderId}/lock`, { method: "DELETE", keepalive: true }).catch(() => undefined);
    };
  }, [orderId]);

  useEffect(() => {
    if (!orderId) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", close);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", close); document.body.style.overflow = ""; };
  }, [onClose, orderId]);

  async function mutate(key: string, task: () => Promise<void>, success: string) {
    if (editLock && !editLock.acquired) {
      setFeedback({ type: "error", message: `${editLock.holderLabel || "Outro usuário"} está editando este pedido. Atualize depois que a edição for liberada.` });
      return;
    }
    setWorking(key);
    setFeedback(null);
    try {
      await task();
      setFeedback({ type: "success", message: success });
      await load();
      dispatchRefresh();
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Não foi possível concluir a ação." });
    } finally {
      setWorking(null);
    }
  }

  if (!orderId || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[110] bg-black/50 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="ml-auto flex h-full w-full max-w-[980px] flex-col bg-[#f7f4ed] shadow-2xl">
        <div className="flex min-h-20 items-center gap-4 border-b border-black/10 bg-white px-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-[.14em] text-basso-wine">Central da comanda</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h2 className="font-display text-2xl font-bold">{order ? `Pedido #${order.number}` : "Carregando pedido"}</h2>
              {order && <StatusPill status={order.status} />}
              {order?.priority && order.priority !== "normal" && <span className={`rounded-full px-2.5 py-1 text-[11px] font-black uppercase ${order.priority === "urgent" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>{order.priority === "urgent" ? "Urgente" : "Prioridade alta"}</span>}
            </div>
          </div>
          <button className="btn-secondary hidden sm:flex" onClick={load} disabled={loading}><RefreshCw size={16} className={loading ? "animate-spin" : ""}/>Atualizar</button>
          <button className="btn-ghost" onClick={onClose} aria-label="Fechar detalhes"><X size={23}/></button>
        </div>

        {feedback && <div className={`mx-4 mt-3 rounded-xl border px-4 py-3 text-sm font-semibold sm:mx-6 ${feedback.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{feedback.message}</div>}
        {lockNotice && <div className={`mx-4 mt-3 rounded-xl border px-4 py-3 text-sm font-semibold sm:mx-6 ${editLock && !editLock.acquired ? "border-amber-200 bg-amber-50 text-amber-800" : "border-blue-200 bg-blue-50 text-blue-800"}`}>{lockNotice}</div>}

        <div className="scrollbar-none flex gap-1 overflow-x-auto border-b border-black/5 bg-white px-4 pt-2 sm:px-6">
          {tabs.map((item) => <button key={item} className={`whitespace-nowrap rounded-t-xl px-4 py-3 text-sm font-bold transition ${tab === item ? "bg-basso-wine text-white" : "text-black/50 hover:bg-black/5 hover:text-black"}`} onClick={() => setTab(item)}>{tabLabels[item]}{item === "ocorrencias" && order?.incidents.some((incident) => incident.status === "open") && <span className="ml-2 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] text-white">{order.incidents.filter((incident) => incident.status === "open").length}</span>}</button>)}
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {loading && !order && <div className="grid h-72 place-items-center"><Loader2 className="animate-spin text-basso-wine" size={36}/></div>}
          {!loading && !order && <div className="surface p-10 text-center"><AlertTriangle className="mx-auto text-red-500" size={40}/><h3 className="mt-3 font-display text-xl font-bold">Pedido indisponível</h3></div>}
          {order && tab === "resumo" && <SummaryTab order={order} drivers={drivers} working={working} mutate={mutate} setOrder={setOrder} />}
          {order && tab === "itens" && <ItemsTab order={order} working={working} mutate={mutate} setOrder={setOrder} />}
          {order && tab === "pagamento" && <PaymentTab order={order} working={working} mutate={mutate} setOrder={setOrder} />}
          {order && tab === "comunicacao" && <CommunicationTab order={order} templates={templates} working={working} mutate={mutate} setOrder={setOrder} />}
          {order && tab === "ocorrencias" && <IncidentsTab order={order} working={working} mutate={mutate} setOrder={setOrder} />}
          {order && tab === "historico" && <HistoryTab order={order} working={working} mutate={mutate} />}
        </div>
      </aside>
    </div>,
    document.body,
  );
}

type Mutate = (key: string, task: () => Promise<void>, success: string) => Promise<void>;

function SummaryTab({ order, drivers, working, mutate, setOrder }: { order: OrderDetail; drivers: Driver[]; working: string | null; mutate: Mutate; setOrder: React.Dispatch<React.SetStateAction<OrderDetail | null>> }) {
  const [status, setStatus] = useState<OrderStatus>(order.status);
  const [statusReason, setStatusReason] = useState("");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    notes: order.notes || "",
    internalSummary: order.internalSummary || "",
    priority: order.priority || "normal",
    estimatedReadyAt: order.estimatedReadyAt ? new Date(order.estimatedReadyAt).toISOString().slice(0, 16) : "",
    discount: String(order.discount / 100).replace(".", ","),
    deliveryFee: String(order.deliveryFee / 100).replace(".", ","),
  });
  const addressText = order.address ? `${order.address.street}, ${order.address.number} • ${order.address.district}${order.address.complement ? ` • ${order.address.complement}` : ""}` : "Sem endereço de entrega";

  useEffect(() => { setStatus(order.status); }, [order.status]);

  async function changeStatus() {
    if (status === order.status) return;
    if (["cancelled", "completed"].includes(status) && statusReason.trim().length < 2) throw new Error("Informe o motivo para concluir ou cancelar manualmente.");
    if (isDemoMode()) {
      demoActions.updateOrderStatus(order.id, status, "Gestor");
      setOrder((current) => current ? { ...current, status, updatedAt: new Date().toISOString(), timeline: [{ id: uid("timeline"), fromStatus: current.status, toStatus: status, reason: statusReason || undefined, actor: "Gestor", source: "operation", createdAt: new Date().toISOString() }, ...current.timeline] } : current);
      return;
    }
    const response = await fetch(`/api/orders/${order.id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, reason: statusReason || undefined, expectedVersion: order.version || undefined }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Falha ao alterar status.");
  }

  async function saveOrder() {
    const patch = {
      action: "update_order",
      customerName: form.customerName,
      customerPhone: form.customerPhone,
      notes: form.notes || null,
      internalSummary: form.internalSummary || null,
      priority: form.priority,
      estimatedReadyAt: form.estimatedReadyAt ? new Date(form.estimatedReadyAt).toISOString() : null,
      discount: Math.max(0, Math.round((Number(form.discount.replace(",", ".")) || 0) * 100)),
      deliveryFee: Math.max(0, Math.round((Number(form.deliveryFee.replace(",", ".")) || 0) * 100)),
      reason: "Dados da comanda atualizados pela operação",
    };
    if (isDemoMode()) {
      const updated: Order = { ...order, customerName: form.customerName, customerPhone: form.customerPhone, notes: form.notes, internalSummary: form.internalSummary, priority: form.priority as Order["priority"], estimatedReadyAt: patch.estimatedReadyAt || undefined, discount: patch.discount, deliveryFee: patch.deliveryFee, total: Math.max(0, order.subtotal - patch.discount + patch.deliveryFee), updatedAt: new Date().toISOString() };
      demoActions.patchOrder(order.id, updated, "Gestor");
      setOrder((current) => current ? { ...current, ...updated, items: current.items } : current);
      setEditing(false);
      return;
    }
    const response = await fetch(`/api/orders/${order.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Falha ao salvar a comanda.");
    setEditing(false);
  }

  async function assignDriver(driverId: string) {
    if (!driverId) return;
    if (isDemoMode()) { demoActions.assignDriver(order.id, driverId); return; }
    const response = await fetch("/api/delivery/assign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: order.id, driverId }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Falha ao atribuir motoboy.");
  }

  return <div className="space-y-5">
    <section className="surface overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-black/5 p-5 lg:flex-row lg:items-end">
        <div className="flex-1"><label className="label">Etapa atual</label><select className="input" value={status} onChange={(event) => setStatus(event.target.value as OrderStatus)}>{allowedStatuses(order.channel).map((value) => <option key={value} value={value}>{statusLabel[value]}</option>)}<option value="cancelled">Cancelado</option></select></div>
        <div className="flex-[1.5]"><label className="label">Motivo / observação da mudança</label><input className="input" value={statusReason} onChange={(event) => setStatusReason(event.target.value)} placeholder="Obrigatório em cancelamento, conclusão manual ou retorno de etapa" /></div>
        <button className="btn-primary" disabled={working === "status" || status === order.status} onClick={() => mutate("status", changeStatus, `Pedido movido para ${statusLabel[status]}.`)}>{working === "status" ? <Loader2 size={17} className="animate-spin"/> : <ChevronRight size={17}/>}Atualizar etapa</button>
      </div>
      <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
        <Info icon={<Clock3/>} label="Entrada" value={shortDateTime(order.createdAt)} />
        <Info icon={<ReceiptText/>} label="Canal" value={channelLabel[order.channel]} />
        <Info icon={<CircleDollarSign/>} label="Total" value={currency(order.total)} strong />
        <Info icon={<CreditCard/>} label="Pagamento" value={`${order.paymentStatus === "paid" ? "Pago" : order.paymentStatus === "partial" ? "Parcial" : "Pendente"} • ${paymentLabels[order.paymentMethod]}`} />
      </div>
    </section>

    <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
      <section className="surface p-5">
        <div className="flex items-center justify-between"><h3 className="flex items-center gap-2 font-display text-xl font-bold"><UserRound className="text-basso-wine"/>Cliente e entrega</h3><button className="btn-ghost" onClick={() => setEditing((value) => !value)}><Edit3 size={16}/>{editing ? "Fechar edição" : "Editar"}</button></div>
        {editing ? <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Nome" value={form.customerName} onChange={(value) => setForm({ ...form, customerName: value })}/>
          <Field label="Telefone" value={form.customerPhone} onChange={(value) => setForm({ ...form, customerPhone: value })}/>
          <label className="sm:col-span-2"><span className="label">Observação do cliente</span><textarea className="textarea" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })}/></label>
          <label className="sm:col-span-2"><span className="label">Resumo interno</span><textarea className="textarea" value={form.internalSummary} onChange={(event) => setForm({ ...form, internalSummary: event.target.value })} placeholder="Informação visível apenas para a equipe"/></label>
          <label><span className="label">Prioridade</span><select className="input" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as typeof form.priority })}><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></label>
          <label><span className="label">Previsão</span><input type="datetime-local" className="input" value={form.estimatedReadyAt} onChange={(event) => setForm({ ...form, estimatedReadyAt: event.target.value })}/></label>
          <Field label="Desconto (R$)" value={form.discount} onChange={(value) => setForm({ ...form, discount: value })}/>
          <Field label="Taxa de entrega (R$)" value={form.deliveryFee} onChange={(value) => setForm({ ...form, deliveryFee: value })}/>
          <button className="btn-primary sm:col-span-2" disabled={working === "save"} onClick={() => mutate("save", saveOrder, "Comanda atualizada e registrada na auditoria.")}>{working === "save" ? <Loader2 className="animate-spin" size={17}/> : <Save size={17}/>}Salvar alterações</button>
        </div> : <div className="mt-5 space-y-4 text-sm">
          <div className="flex items-center gap-3"><UserRound size={18} className="text-basso-wine"/><div><p className="font-bold">{order.customerName}</p><a href={`tel:${order.customerPhone}`} className="text-black/50 hover:text-basso-wine">{order.customerPhone || "Telefone não informado"}</a></div></div>
          <div className="flex items-start gap-3"><MapPin size={18} className="mt-0.5 text-basso-wine"/><div><p className="font-semibold">{addressText}</p>{order.address?.reference && <p className="mt-1 text-black/45">Referência: {order.address.reference}</p>}</div></div>
          {order.notes && <div className="rounded-xl bg-basso-paper p-3"><strong>Observação:</strong> {order.notes}</div>}
          {order.internalSummary && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900"><strong>Nota interna:</strong> {order.internalSummary}</div>}
          <div className="flex flex-wrap gap-2"><a href={`tel:${order.customerPhone}`} className="btn-secondary"><Phone size={16}/>Ligar</a><button className="btn-secondary" onClick={() => navigator.clipboard.writeText(addressText)}><Copy size={16}/>Copiar endereço</button>{order.address && <a className="btn-secondary" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressText)}`}><ExternalLink size={16}/>Abrir navegação</a>}</div>
        </div>}
      </section>

      <section className="surface p-5">
        <h3 className="flex items-center gap-2 font-display text-xl font-bold"><Bike className="text-basso-wine"/>Responsabilidade e despacho</h3>
        <div className="mt-5 space-y-4">
          <label><span className="label">Motoboy responsável</span><select className="input" value={order.driverId || ""} onChange={(event) => mutate("driver", () => assignDriver(event.target.value), "Entrega atribuída ao motoboy.")}><option value="">Não atribuído</option>{drivers.map((driver: any) => <option key={driver.id} value={driver.id} disabled={!driver.available && driver.id !== order.driverId}>{driver.name} • {driver.available ? "Disponível" : "Em entrega"}</option>)}</select></label>
          <div className="grid grid-cols-2 gap-3"><Info icon={<Package/>} label="Itens" value={String(order.items.filter((item) => item.productionStatus !== "cancelled").reduce((sum, item) => sum + item.quantity, 0))}/><Info icon={<Clock3/>} label="Atualizado" value={shortDateTime(order.updatedAt)}/></div>
          <button className="btn-secondary w-full" disabled={working === "print"} onClick={() => mutate("print", async () => {
            if (isDemoMode()) return;
            const response = await fetch(`/api/orders/${order.id}/print`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sector: "all", reason: "Reimpressão solicitada na central da comanda" }) });
            const body = await response.json(); if (!response.ok) throw new Error(body.error || "Falha ao enfileirar impressão.");
          }, "Impressão adicionada à fila. Verifique o agente local.")}>{working === "print" ? <Loader2 className="animate-spin" size={17}/> : <Printer size={17}/>}Imprimir / reimprimir com auditoria</button>
        </div>
      </section>
    </div>
  </div>;
}

function ItemsTab({ order, working, mutate, setOrder }: { order: OrderDetail; working: string | null; mutate: Mutate; setOrder: React.Dispatch<React.SetStateAction<OrderDetail | null>> }) {
  const [reason, setReason] = useState("Correção solicitada pela operação");
  async function updateItem(item: ManagedOrderItem, action: "quantity" | "cancel" | "restore" | "production_status", value?: number | string) {
    if (isDemoMode()) {
      const items = order.items.map((row) => row.id === item.id ? { ...row, quantity: action === "quantity" ? Number(value) : row.quantity, productionStatus: action === "cancel" ? "cancelled" as const : action === "restore" ? "queued" as const : action === "production_status" ? value as ManagedOrderItem["productionStatus"] : row.productionStatus, cancelledReason: action === "cancel" ? reason : action === "restore" ? undefined : row.cancelledReason } : row);
      const subtotal = items.filter((row) => row.productionStatus !== "cancelled").reduce((sum, row) => sum + row.quantity * row.unitPrice, 0);
      const updated = { ...order, items, subtotal, total: Math.max(0, subtotal - order.discount + order.deliveryFee) };
      demoActions.patchOrder(order.id, updated, "Gestor");
      setOrder(updated);
      return;
    }
    const response = await fetch(`/api/orders/${order.id}/items?itemId=${encodeURIComponent(item.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, quantity: action === "quantity" ? Number(value) : undefined, status: action === "production_status" ? value : undefined, reason }) });
    const body = await response.json(); if (!response.ok) throw new Error(body.error || "Falha ao alterar item.");
  }
  return <div className="space-y-5">
    <div className="surface flex flex-col gap-3 p-4 sm:flex-row sm:items-end"><label className="flex-1"><span className="label">Motivo das alterações</span><input className="input" value={reason} onChange={(event) => setReason(event.target.value)} /></label><Link href={`/painel/pdv?appendTo=${encodeURIComponent(order.id)}&number=${order.number}`} className="btn-primary"><Plus size={17}/>Adicionar itens pelo PDV</Link></div>
    <div className="space-y-4">{order.items.map((item) => <article key={item.id} className={`surface overflow-hidden ${item.productionStatus === "cancelled" ? "opacity-60" : ""}`}>
      <div className="flex flex-col gap-4 p-5 md:flex-row md:items-start">
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-display text-lg font-bold">{item.name}</h3><span className="rounded-full bg-basso-paper px-2 py-1 text-[10px] font-black uppercase">{item.sector === "bar" ? "Bar" : item.sector === "counter" ? "Balcão" : "Cozinha"}</span><ProductionPill status={item.productionStatus}/></div><ItemSelection item={item}/>{item.cancelledReason && <p className="mt-2 text-xs font-bold text-red-700">Cancelado: {item.cancelledReason}</p>}</div>
        <div className="flex flex-wrap items-center gap-2"><button className="rounded-xl border p-2 disabled:opacity-30" disabled={item.quantity <= 1 || item.productionStatus === "cancelled" || working === `item_${item.id}`} onClick={() => mutate(`item_${item.id}`, () => updateItem(item, "quantity", item.quantity - 1), "Quantidade atualizada.")}><Minus size={16}/></button><strong className="w-8 text-center">{item.quantity}</strong><button className="rounded-xl border p-2 disabled:opacity-30" disabled={item.productionStatus === "cancelled" || working === `item_${item.id}`} onClick={() => mutate(`item_${item.id}`, () => updateItem(item, "quantity", item.quantity + 1), "Quantidade atualizada.")}><Plus size={16}/></button><strong className="ml-2 text-basso-wine">{currency(item.unitPrice * item.quantity)}</strong></div>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-black/5 bg-black/[.015] p-3 sm:justify-end">{item.productionStatus !== "cancelled" ? <><button className="btn-ghost" onClick={() => mutate(`item_${item.id}`, () => updateItem(item, "production_status", item.productionStatus === "ready" ? "queued" : "ready"), "Status de produção atualizado.")}><CheckCircle2 size={16}/>{item.productionStatus === "ready" ? "Retornar para fila" : "Marcar pronto"}</button><button className="btn-ghost text-red-700" onClick={() => mutate(`item_${item.id}`, () => updateItem(item, "cancel"), "Item cancelado e total recalculado.")}><Trash2 size={16}/>Cancelar item</button></> : <button className="btn-ghost" onClick={() => mutate(`item_${item.id}`, () => updateItem(item, "restore"), "Item restaurado e total recalculado.")}><RefreshCw size={16}/>Restaurar item</button>}</div>
    </article>)}</div>
    <section className="surface ml-auto max-w-md p-5"><MoneyRow label="Subtotal" value={order.subtotal}/><MoneyRow label="Desconto" value={-order.discount}/><MoneyRow label="Taxa" value={order.deliveryFee}/><div className="mt-3 flex justify-between border-t pt-3 text-xl"><strong>Total</strong><strong className="text-basso-wine">{currency(order.total)}</strong></div></section>
  </div>;
}

function PaymentTab({ order, working, mutate, setOrder }: { order: OrderDetail; working: string | null; mutate: Mutate; setOrder: React.Dispatch<React.SetStateAction<OrderDetail | null>> }) {
  const [method, setMethod] = useState<PaymentMethod>(order.paymentMethod);
  const [amount, setAmount] = useState(String((order.balanceDue || order.total) / 100).replace(".", ","));
  const [note, setNote] = useState("");
  async function record() {
    const cents = Math.round((Number(amount.replace(",", ".")) || 0) * 100);
    if (cents <= 0) throw new Error("Informe um valor válido.");
    if (isDemoMode()) {
      const payment: OrderPaymentRecord = { id: uid("pay"), method, status: "paid", amount: cents, provider: "manual", createdBy: "Gestor", createdAt: new Date().toISOString() };
      const paidAmount = (order.paidAmount || 0) + cents;
      const paymentStatus = paidAmount >= order.total ? "paid" as const : "partial" as const;
      demoActions.patchOrder(order.id, { paymentStatus }, "Gestor");
      setOrder({ ...order, payments: [payment, ...order.payments], paidAmount, balanceDue: Math.max(0, order.total - paidAmount), paymentStatus });
      return;
    }
    const response = await fetch(`/api/orders/${order.id}/payments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method, amount: cents, idempotencyKey: uid("manual_payment"), note }) });
    const body = await response.json(); if (!response.ok) throw new Error(body.error || "Falha ao registrar pagamento.");
  }
  return <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
    <section className="surface p-5"><h3 className="font-display text-xl font-bold">Registrar recebimento</h3><div className="mt-5 space-y-4"><label><span className="label">Forma de pagamento</span><select className="input" value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>{Object.entries(paymentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><Field label="Valor recebido (R$)" value={amount} onChange={setAmount}/><label><span className="label">Observação</span><textarea className="textarea" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ex.: comprovante conferido, troco entregue, terminal utilizado"/></label><button className="btn-primary w-full" disabled={working === "payment" || (order.balanceDue || 0) <= 0} onClick={() => mutate("payment", record, "Pagamento registrado, vinculado ao caixa e auditado.")}>{working === "payment" ? <Loader2 className="animate-spin" size={17}/> : <CircleDollarSign size={17}/>}Confirmar recebimento</button></div></section>
    <div className="space-y-5"><section className="grid gap-3 sm:grid-cols-3"><Metric label="Total da comanda" value={currency(order.total)}/><Metric label="Recebido" value={currency(order.paidAmount || 0)} tone="success"/><Metric label="Saldo pendente" value={currency(order.balanceDue || 0)} tone={(order.balanceDue || 0) > 0 ? "warning" : "success"}/></section><section className="surface overflow-hidden"><div className="border-b p-5"><h3 className="font-display text-xl font-bold">Histórico de pagamentos</h3></div><div className="divide-y">{order.payments.map((payment) => <div key={payment.id} className="flex flex-wrap items-center gap-3 p-4"><CreditCard size={18} className="text-basso-wine"/><div className="min-w-0 flex-1"><strong>{paymentLabels[payment.method]}</strong><p className="text-xs text-black/45">{payment.provider || "Manual"} • {shortDateTime(payment.createdAt)}</p></div><span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">{payment.status}</span><strong>{currency(payment.amount)}</strong></div>)}{!order.payments.length && <p className="p-8 text-center text-sm text-black/45">Nenhum pagamento registrado.</p>}</div></section></div>
  </div>;
}

function CommunicationTab({ order, templates, working, mutate, setOrder }: { order: OrderDetail; templates: CommunicationTemplate[]; working: string | null; mutate: Mutate; setOrder: React.Dispatch<React.SetStateAction<OrderDetail | null>> }) {
  const [templateKey, setTemplateKey] = useState(templates[0]?.key || "confirmation");
  const [customMessage, setCustomMessage] = useState("");
  const template = templates.find((item) => item.key === templateKey) || fallbackTemplates[0];
  const generated = useMemo(() => {
    const address = order.address ? `${order.address.street}, ${order.address.number}, ${order.address.district}` : "endereço não informado";
    const prediction = order.estimatedReadyAt ? shortDateTime(order.estimatedReadyAt) : "a confirmar";
    return (customMessage || template.body)
      .replaceAll("{cliente}", order.customerName)
      .replaceAll("{numero}", String(order.number))
      .replaceAll("{endereco}", address)
      .replaceAll("{previsao}", prediction)
      .replaceAll("{pix}", "consulte a chave configurada pela pizzaria")
      .replaceAll("{rastreamento}", order.trackingToken ? `${window.location.origin}/acompanhar/${order.trackingToken}` : "link liberado após atribuição do motoboy");
  }, [customMessage, order, template.body]);
  async function openWhatsApp() {
    const phone = order.customerPhone.replace(/\D/g, "");
    if (phone.length < 10) throw new Error("Telefone do cliente não é válido.");
    if (!isDemoMode()) {
      const response = await fetch(`/api/orders/${order.id}/communications`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ templateKey, message: generated, recipient: phone, status: "opened" }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "Falha ao registrar comunicação.");
    } else {
      const communication: OrderCommunicationLog = {
        id: uid("communication"),
        channel: "manual_whatsapp",
        templateKey,
        recipient: phone,
        message: generated,
        status: "opened",
        actor: "Gestor",
        createdAt: new Date().toISOString(),
      };
      setOrder((current) => current
        ? { ...current, communications: [communication, ...current.communications] }
        : current);
    }
    window.open(`https://wa.me/${phone.startsWith("55") ? phone : `55${phone}`}?text=${encodeURIComponent(generated)}`, "_blank", "noopener,noreferrer");
  }
  return <div className="grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
    <section className="surface p-5"><h3 className="flex items-center gap-2 font-display text-xl font-bold"><MessageCircle className="text-basso-wine"/>WhatsApp manual</h3><p className="mt-2 text-sm text-black/50">O sistema abre a conversa com a mensagem preenchida. O funcionário revisa e envia manualmente.</p><div className="mt-5 space-y-4"><label><span className="label">Modelo</span><select className="input" value={templateKey} onChange={(event) => { setTemplateKey(event.target.value); setCustomMessage(""); }}>{templates.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}</select></label><label><span className="label">Mensagem</span><textarea className="textarea min-h-40" value={customMessage || generated} onChange={(event) => setCustomMessage(event.target.value)}/></label><button className="btn-primary w-full" disabled={working === "whatsapp"} onClick={() => mutate("whatsapp", openWhatsApp, "Conversa aberta e tentativa registrada no histórico.")}>{working === "whatsapp" ? <Loader2 className="animate-spin" size={17}/> : <MessageCircle size={17}/>}Abrir WhatsApp do cliente</button><a className="btn-secondary w-full" href={`tel:${order.customerPhone}`}><Phone size={17}/>Ligar para o cliente</a></div></section>
    <section className="surface overflow-hidden"><div className="border-b p-5"><h3 className="font-display text-xl font-bold">Histórico de contatos</h3></div><div className="divide-y">{order.communications.map((entry) => <div key={entry.id} className="p-4"><div className="flex items-center justify-between gap-3"><strong>{entry.templateKey || entry.channel}</strong><span className="text-xs text-black/40">{shortDateTime(entry.createdAt)}</span></div><p className="mt-2 whitespace-pre-wrap text-sm text-black/60">{entry.message}</p><p className="mt-2 text-xs font-semibold text-basso-wine">{entry.actor} • {entry.status === "opened" ? "Conversa aberta; envio não confirmado" : entry.status}</p></div>)}{!order.communications.length && <p className="p-8 text-center text-sm text-black/45">Nenhum contato registrado para esta comanda.</p>}</div></section>
  </div>;
}

function IncidentsTab({ order, working, mutate, setOrder }: { order: OrderDetail; working: string | null; mutate: Mutate; setOrder: React.Dispatch<React.SetStateAction<OrderDetail | null>> }) {
  const [note, setNote] = useState("");
  const [pinned, setPinned] = useState(false);
  const [incident, setIncident] = useState({ category: "other", severity: "medium", title: "", description: "" });
  async function addNote() {
    if (note.trim().length < 1) throw new Error("Escreva uma nota.");
    if (isDemoMode()) {
      const internalNote: OrderInternalNote = {
        id: uid("note"),
        body: note.trim(),
        pinned,
        actor: "Gestor",
        createdAt: new Date().toISOString(),
      };
      setOrder((current) => current
        ? { ...current, internalNotes: [internalNote, ...current.internalNotes] }
        : current);
      setNote("");
      return;
    }
    const response = await fetch(`/api/orders/${order.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "add_note", body: note.trim(), pinned }) });
    const body = await response.json(); if (!response.ok) throw new Error(body.error || "Falha ao adicionar nota."); setNote("");
  }
  async function addIncident() {
    if (incident.title.trim().length < 2) throw new Error("Informe o título da ocorrência.");
    if (isDemoMode()) { const entry: OrderIncident = { id: uid("incident"), category: incident.category as OrderIncident["category"], severity: incident.severity as OrderIncident["severity"], title: incident.title, description: incident.description, status: "open", createdAt: new Date().toISOString() }; setOrder((current) => current ? { ...current, incidents: [entry, ...current.incidents] } : current); setIncident({ category: "other", severity: "medium", title: "", description: "" }); return; }
    const response = await fetch(`/api/orders/${order.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "add_incident", ...incident }) });
    const body = await response.json(); if (!response.ok) throw new Error(body.error || "Falha ao registrar ocorrência."); setIncident({ category: "other", severity: "medium", title: "", description: "" });
  }
  async function resolve(entry: OrderIncident) {
    const resolution = window.prompt("Descreva como a ocorrência foi resolvida:");
    if (!resolution || resolution.trim().length < 2) return;
    if (isDemoMode()) {
      setOrder((current) => current
        ? {
            ...current,
            incidents: current.incidents.map((item): OrderIncident => item.id === entry.id
              ? { ...item, status: "resolved", resolution, resolvedAt: new Date().toISOString() }
              : item),
          }
        : current);
      return;
    }
    const response = await fetch(`/api/orders/${order.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "resolve_incident", incidentId: entry.id, resolution }) });
    const body = await response.json(); if (!response.ok) throw new Error(body.error || "Falha ao resolver ocorrência.");
  }
  return <div className="grid gap-5 xl:grid-cols-2">
    <div className="space-y-5"><section className="surface p-5"><h3 className="flex items-center gap-2 font-display text-xl font-bold"><StickyNote className="text-basso-wine"/>Nota interna</h3><textarea className="textarea mt-4" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Informações para a equipe; não aparecem ao cliente"/><label className="mt-3 flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)}/>Fixar no topo</label><button className="btn-primary mt-4 w-full" disabled={working === "note"} onClick={() => mutate("note", addNote, "Nota interna registrada.")}><Plus size={17}/>Adicionar nota</button></section><section className="surface overflow-hidden"><div className="border-b p-5"><h3 className="font-display text-xl font-bold">Notas da equipe</h3></div><div className="divide-y">{order.internalNotes.map((entry) => <div key={entry.id} className={entry.pinned ? "bg-amber-50 p-4" : "p-4"}><p className="text-sm">{entry.body}</p><p className="mt-2 text-xs text-black/40">{entry.actor} • {shortDateTime(entry.createdAt)}{entry.pinned ? " • Fixada" : ""}</p></div>)}{!order.internalNotes.length && <p className="p-8 text-center text-sm text-black/45">Nenhuma nota interna.</p>}</div></section></div>
    <div className="space-y-5"><section className="surface p-5"><h3 className="flex items-center gap-2 font-display text-xl font-bold"><ShieldAlert className="text-basso-wine"/>Registrar ocorrência</h3><div className="mt-4 grid gap-3 sm:grid-cols-2"><label><span className="label">Categoria</span><select className="input" value={incident.category} onChange={(event) => setIncident({ ...incident, category: event.target.value })}><option value="customer">Cliente</option><option value="address">Endereço</option><option value="payment">Pagamento</option><option value="production">Produção</option><option value="delivery">Entrega</option><option value="quality">Qualidade</option><option value="other">Outros</option></select></label><label><span className="label">Gravidade</span><select className="input" value={incident.severity} onChange={(event) => setIncident({ ...incident, severity: event.target.value })}><option value="low">Baixa</option><option value="medium">Média</option><option value="high">Alta</option><option value="critical">Crítica</option></select></label><label className="sm:col-span-2"><span className="label">Título</span><input className="input" value={incident.title} onChange={(event) => setIncident({ ...incident, title: event.target.value })}/></label><label className="sm:col-span-2"><span className="label">Descrição</span><textarea className="textarea" value={incident.description} onChange={(event) => setIncident({ ...incident, description: event.target.value })}/></label></div><button className="btn-primary mt-4 w-full" disabled={working === "incident"} onClick={() => mutate("incident", addIncident, "Ocorrência registrada e destacada na comanda.")}><AlertTriangle size={17}/>Registrar ocorrência</button></section><section className="space-y-3">{order.incidents.map((entry) => <article key={entry.id} className={`surface border-l-4 p-4 ${entry.status === "resolved" ? "border-l-emerald-500" : entry.severity === "critical" ? "border-l-red-600" : "border-l-amber-500"}`}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase text-black/40">{entry.category} • {entry.severity}</p><h4 className="mt-1 font-bold">{entry.title}</h4></div><span className={`rounded-full px-2 py-1 text-xs font-bold ${entry.status === "resolved" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{entry.status === "resolved" ? "Resolvida" : "Aberta"}</span></div>{entry.description && <p className="mt-2 text-sm text-black/60">{entry.description}</p>}{entry.resolution && <p className="mt-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900"><strong>Resolução:</strong> {entry.resolution}</p>}<div className="mt-3 flex items-center justify-between"><span className="text-xs text-black/40">{shortDateTime(entry.createdAt)}</span>{entry.status === "open" && <button className="btn-ghost" onClick={() => mutate(`resolve_${entry.id}`, () => resolve(entry), "Ocorrência resolvida.")}><CheckCircle2 size={16}/>Resolver</button>}</div></article>)}{!order.incidents.length && <div className="surface p-8 text-center text-sm text-black/45">Nenhuma ocorrência registrada.</div>}</section></div>
  </div>;
}

function HistoryTab({ order, working, mutate }: { order: OrderDetail; working: string | null; mutate: Mutate }) {
  return <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]"><section className="surface overflow-hidden"><div className="border-b p-5"><h3 className="flex items-center gap-2 font-display text-xl font-bold"><History className="text-basso-wine"/>Linha do tempo</h3></div><div className="divide-y">{order.timeline.map((entry) => <div key={entry.id} className="flex gap-4 p-4"><div className="mt-1 h-3 w-3 shrink-0 rounded-full bg-basso-wine ring-4 ring-basso-wine/10"/><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong>{entry.fromStatus ? `${statusLabel[entry.fromStatus]} → ` : ""}{statusLabel[entry.toStatus]}</strong><span className="rounded-full bg-basso-paper px-2 py-0.5 text-[10px] font-bold">{entry.source}</span></div>{entry.reason && <p className="mt-1 text-sm text-black/55">{entry.reason}</p>}<p className="mt-1 text-xs text-black/40">{entry.actor || "Sistema"} • {shortDateTime(entry.createdAt)}</p></div></div>)}{!order.timeline.length && <p className="p-8 text-center text-sm text-black/45">Histórico indisponível.</p>}</div></section><section className="surface overflow-hidden"><div className="border-b p-5"><h3 className="flex items-center gap-2 font-display text-xl font-bold"><Printer className="text-basso-wine"/>Impressão</h3></div><div className="divide-y">{order.printJobs.map((job) => <div key={job.id} className="p-4"><div className="flex items-center justify-between"><strong>{job.sector}</strong><span className={`rounded-full px-2 py-1 text-xs font-bold ${job.status === "done" ? "bg-emerald-50 text-emerald-700" : job.status === "failed" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>{job.status}</span></div><p className="mt-1 text-xs text-black/45">{job.printerKey} • tentativa {job.attempts}{job.isReprint ? " • reimpressão" : ""}</p>{job.lastError && <p className="mt-2 text-xs font-semibold text-red-700">{job.lastError}</p>}</div>)}{!order.printJobs.length && <p className="p-8 text-center text-sm text-black/45">Nenhuma impressão registrada. O agente local pode ainda não estar configurado.</p>}</div><button className="btn-secondary m-4 w-[calc(100%-2rem)]" disabled={working === "print_history"} onClick={() => mutate("print_history", async () => { if (isDemoMode()) return; const response = await fetch(`/api/orders/${order.id}/print`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sector: "all", reason: "Reimpressão solicitada pelo histórico" }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error || "Falha ao imprimir."); }, "Reimpressão adicionada à fila.")}><Printer size={16}/>Solicitar reimpressão</button></section></div>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label><span className="label">{label}</span><input className="input" value={value} onChange={(event) => onChange(event.target.value)}/></label>; }
function Info({ icon, label, value, strong = false }: { icon: React.ReactNode; label: string; value: string; strong?: boolean }) { return <div className="flex items-start gap-3 rounded-2xl bg-basso-paper p-3"><span className="mt-0.5 text-basso-wine">{icon}</span><div><p className="text-[10px] font-black uppercase tracking-wide text-black/35">{label}</p><p className={`mt-1 text-sm ${strong ? "font-black text-basso-wine" : "font-semibold"}`}>{value}</p></div></div>; }
function Metric({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "success" | "warning" }) { return <div className={`surface p-4 ${tone === "success" ? "border-emerald-200 bg-emerald-50" : tone === "warning" ? "border-amber-200 bg-amber-50" : ""}`}><p className="text-xs font-bold uppercase text-black/40">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></div>; }
function MoneyRow({ label, value }: { label: string; value: number }) { return <div className="flex justify-between py-1 text-sm"><span className="text-black/50">{label}</span><strong className={value < 0 ? "text-red-700" : ""}>{value < 0 ? `− ${currency(Math.abs(value))}` : currency(value)}</strong></div>; }
function StatusPill({ status }: { status: OrderStatus }) { const classes: Record<OrderStatus, string> = { received: "bg-amber-100 text-amber-900", confirmed: "bg-blue-100 text-blue-900", preparing: "bg-violet-100 text-violet-900", ready: "bg-emerald-100 text-emerald-900", out_for_delivery: "bg-cyan-100 text-cyan-900", completed: "bg-stone-200 text-stone-700", cancelled: "bg-red-100 text-red-800" }; return <span className={`rounded-full px-2.5 py-1 text-xs font-black ${classes[status]}`}>{statusLabel[status]}</span>; }
function ProductionPill({ status }: { status: ManagedOrderItem["productionStatus"] }) { const label = status === "queued" ? "Na fila" : status === "preparing" ? "Em preparo" : status === "ready" ? "Pronto" : "Cancelado"; return <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${status === "ready" ? "bg-emerald-50 text-emerald-700" : status === "cancelled" ? "bg-red-50 text-red-700" : status === "preparing" ? "bg-violet-50 text-violet-700" : "bg-stone-100 text-stone-600"}`}>{label}</span>; }
function ItemSelection({ item }: { item: ManagedOrderItem }) { if (!item.selection || !("flavorA" in item.selection)) return null; const selection = item.selection; return <div className="mt-2 space-y-1 text-xs text-black/55"><p>{selection.size === "grande" ? "Grande" : "Broto"} • massa {selection.mass === "integral" ? "integral" : "tradicional"}</p>{selection.removedA?.length > 0 && <p className="font-bold text-red-700">SEM: {selection.removedA.join(", ")}</p>}{Object.values(selection.addons || {}).reduce((sum, value) => sum + value, 0) > 0 && <p className="font-bold text-basso-wine">Com adicionais</p>}{selection.notes && <p className="rounded-lg bg-amber-50 p-2 text-amber-900">{selection.notes}</p>}</div>; }
