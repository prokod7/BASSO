"use client";

import { useSyncExternalStore } from "react";
import { allProducts, catalog } from "@/lib/catalog";
import { cartSubtotal } from "@/lib/pricing";
import { isDemoMode, uid } from "@/lib/utils";
import type { CampaignRecord, CashMovement, Coupon, DemoTable, Driver, FinancialEntry, InventoryItem, Order, OrderStatus, PaymentMethod } from "@/types";
import { enqueueOfflineOperation } from "@/lib/offline-queue";

export interface DemoState {
  orders: Order[];
  tables: DemoTable[];
  drivers: Driver[];
  inventory: InventoryItem[];
  coupons: Coupon[];
  cashOpen: boolean;
  cashInitial: number;
  cashOpenedAt?: string;
  cashMovements: CashMovement[];
  financialEntries: FinancialEntry[];
  campaigns: CampaignRecord[];
  integrationEvents: Array<{ id: string; provider: string; type: string; status: "ok" | "error" | "pending"; createdAt: string; attempts: number; lastError?: string }>;
  audit: Array<{ id: string; actor: string; action: string; entity: string; entityId: string; createdAt: string; details?: string }>;
}

const KEY = "lfb-pedidopro-v31";
const channel = typeof window !== "undefined" && "BroadcastChannel" in window ? new BroadcastChannel("lfb-pedidopro") : null;
let memory: DemoState | null = null;
const listeners = new Set<() => void>();

function sampleOrder(partial: Partial<Order> & Pick<Order, "id" | "number" | "status" | "channel" | "customerName">): Order {
  const created = new Date(Date.now() - partial.number * 7 * 60_000).toISOString();
  const pizza = catalog.flavors.find(f => f.id === (partial.number % 2 ? "calabresa-tradicional" : "mozzarella"))!;
  const items = [{ id: uid("item"), kind: "pizza" as const, name: `Pizza Grande • ${pizza.name}`, quantity: 1, unitPrice: pizza.priceGrande, selection: { size: "grande" as const, mass: "traditional" as const, flavorA: pizza.id, removedA: [], removedB: [], addons: {}, notes: "" } }];
  return {
    paymentStatus: partial.status === "completed" ? "paid" : "pending",
    customerPhone: "11970000000",
    items,
    subtotal: cartSubtotal(items), discount: 0, deliveryFee: partial.channel === "own_delivery" ? 700 : 0,
    total: cartSubtotal(items) + (partial.channel === "own_delivery" ? 700 : 0), paymentMethod: "pix",
    createdAt: created, updatedAt: created, sourceIdempotencyKey: partial.id,
    ...partial
  };
}

function initialState(): DemoState {
  const now = new Date().toISOString();
  return {
    orders: [
      sampleOrder({ id: "demo_1054", number: 1054, status: "received", channel: "own_delivery", customerName: "Lucas Almeida", paymentStatus: "paid", address: { cep: "09450000", street: "Rua do Progresso", number: "820", district: "Centro", city: "Rio Grande da Serra", state: "SP" } }),
      sampleOrder({ id: "demo_1053", number: 1053, status: "preparing", channel: "pickup", customerName: "Marina Souza", paymentStatus: "paid" }),
      sampleOrder({ id: "demo_1052", number: 1052, status: "ready", channel: "dine_in", customerName: "Mesa 4", tableNumber: 4, paymentStatus: "partial" }),
      sampleOrder({ id: "demo_1051", number: 1051, status: "confirmed", channel: "ifood", customerName: "Cliente iFood", paymentStatus: "paid" }),
      sampleOrder({ id: "demo_1050", number: 1050, status: "completed", channel: "own_delivery", customerName: "Ana Pereira", paymentStatus: "paid" })
    ],
    tables: catalog.tables.map(t => ({ ...t, status: t.number === 4 || t.number === 7 ? "occupied" : t.number === 12 ? "partial" : "free", people: t.number === 4 ? 4 : t.number === 7 ? 2 : undefined, openedAt: t.number === 4 || t.number === 7 ? new Date(Date.now() - 65 * 60_000).toISOString() : undefined, tabs: t.number === 4 ? [{ id: "tab_4a", name: "Família Silva", items: [], paidCents: 0, totalCents: 0, waiter: "Garçom 1", status: "open" }] : [] })),
    drivers: [
      { id: "driver_1", name: "Motoboy 1", phone: "11980000001", vehicle: "Moto", available: true },
      { id: "driver_2", name: "Motoboy 2", phone: "11980000002", vehicle: "Moto", available: true },
      { id: "driver_3", name: "Motoboy 3", phone: "11980000003", vehicle: "Moto", available: false, activeOrderId: "demo_1049" }
    ],
    inventory: allProducts.map((p, index) => ({ id: `inv_${p.id}`, productId: p.id, name: p.name, unit: p.category === "desserts" ? "pote" : "unidade", quantity: 8 + (index * 7) % 31, minQuantity: 6, allowNegative: false, updatedAt: now })),
    coupons: [{ id: "coupon_demo", code: "10OFF", type: "percentage", value: 10, totalLimit: 15, uses: 3, minimum: 5000, channels: ["own_delivery", "pickup"], active: true }],
    cashOpen: true, cashInitial: 15000, cashOpenedAt: new Date(Date.now() - 5 * 60 * 60_000).toISOString(),
    cashMovements: [
      { id: "cash_demo_1", kind: "supply", amount: 5000, reason: "Reforço de troco", createdAt: new Date(Date.now() - 4 * 60 * 60_000).toISOString(), actor: "Atendente 1" },
      { id: "cash_demo_2", kind: "withdrawal", amount: -3000, reason: "Sangria preventiva", createdAt: new Date(Date.now() - 2 * 60 * 60_000).toISOString(), actor: "Gestor" }
    ],
    financialEntries: [
      { id: "fin_demo_1", kind: "expense", status: "pending", description: "Compra de embalagens", categoryName: "Operação", amount: 18640, dueDate: new Date(Date.now()+2*86400000).toISOString().slice(0,10), recurring: false, createdAt: now },
      { id: "fin_demo_2", kind: "expense", status: "settled", description: "Taxas de meios de pagamento", categoryName: "Taxas", amount: 7200, dueDate: new Date().toISOString().slice(0,10), settledAt: now, paymentMethod: "pix", recurring: false, createdAt: now }
    ],
    campaigns: [
      { id: "campaign_demo_1", name: "Reativação de clientes", channel: "push", segment: { type: "inactive" }, template: { title: "La Forneria Basso", message: "Sentimos sua falta. Confira o cardápio de hoje." }, status: "draft", createdAt: now, metrics: { recipients: 0, sent: 0, opened: 0, converted: 0 } }
    ],
    integrationEvents: [
      { id: "evt_1", provider: "iFood", type: "ORDER_PLACED", status: "ok", createdAt: now, attempts: 1 },
      { id: "evt_2", provider: "99Food", type: "HEALTH_CHECK", status: "pending", createdAt: now, attempts: 0 }
    ],
    audit: [{ id: "audit_1", actor: "Gestor", action: "LOGIN", entity: "session", entityId: "demo", createdAt: now, details: "Acesso ao painel de demonstração" }]
  };
}

function normalizeState(value: Partial<DemoState> | null): DemoState {
  const fallback = initialState();
  if (!value) return fallback;
  return {
    ...fallback,
    ...value,
    orders: Array.isArray(value.orders) ? value.orders : fallback.orders,
    tables: Array.isArray(value.tables) ? value.tables.map(table => ({ ...table, tabs: Array.isArray(table.tabs) ? table.tabs.map(tab => ({ ...tab, totalCents: tab.totalCents || 0, status: tab.status || "open" })) : [] })) : fallback.tables,
    drivers: Array.isArray(value.drivers) ? value.drivers : fallback.drivers,
    inventory: Array.isArray(value.inventory) ? value.inventory : fallback.inventory,
    coupons: Array.isArray(value.coupons) ? value.coupons : fallback.coupons,
    cashMovements: Array.isArray(value.cashMovements) ? value.cashMovements : [],
    financialEntries: Array.isArray(value.financialEntries) ? value.financialEntries : [],
    campaigns: Array.isArray(value.campaigns) ? value.campaigns : [],
    integrationEvents: Array.isArray(value.integrationEvents) ? value.integrationEvents : fallback.integrationEvents,
    audit: Array.isArray(value.audit) ? value.audit : fallback.audit
  };
}

function load(): DemoState {
  if (memory) return memory;
  if (typeof window === "undefined") return initialState();
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "null") as Partial<DemoState> | null;
    memory = normalizeState(parsed);
  } catch { memory = initialState(); }
  return memory;
}
function fire(path: string, init?: RequestInit) {
  if (isDemoMode() || typeof window === "undefined") return;
  const headers = { "Content-Type": "application/json", ...(init?.headers || {}) } as Record<string, string>;
  fetch(path, { ...init, headers }).then(async response => {
    if (!response.ok && response.status >= 500) throw new Error("Falha temporária");
  }).catch(() => enqueueOfflineOperation({
    url: path,
    method: init?.method || "POST",
    headers,
    body: typeof init?.body === "string" ? init.body : undefined
  }));
}

function save(next: DemoState) {
  memory = next;
  if (typeof window !== "undefined") localStorage.setItem(KEY, JSON.stringify(next));
  listeners.forEach(l => l());
  channel?.postMessage("changed");
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => { if (event.key === KEY) { memory = null; listener(); } };
  const onBroadcast = () => { memory = null; listener(); };
  window.addEventListener("storage", onStorage);
  channel?.addEventListener("message", onBroadcast);
  return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); channel?.removeEventListener("message", onBroadcast); };
}

export function useDemoState<T>(selector: (state: DemoState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(load()), () => selector(initialState()));
}
export const demoActions = {
  reset() { save(initialState()); },
  addOrderLocal(order: Order, actor = "Operação") { const s=load(); const tables=order.tabId?s.tables.map(table=>({...table,tabs:table.tabs.map(tab=>tab.id===order.tabId?{...tab,items:[...tab.items,...order.items],totalCents:tab.totalCents+order.total}:tab)})):s.tables; save({ ...s, tables, orders:[order,...s.orders], audit:[{id:uid("audit"),actor,action:"ORDER_CREATED",entity:"order",entityId:order.id,createdAt:new Date().toISOString()},...s.audit] }); },
  replaceSnapshot(snapshot: Partial<DemoState>) { save({ ...initialState(), ...load(), ...snapshot }); },
  createOrder(order: Order, endpoint = "/api/orders", metadata?: Record<string, unknown>) { const s = load(); const tables=order.tabId?s.tables.map(table=>({...table,tabs:table.tabs.map(tab=>tab.id===order.tabId?{...tab,items:[...tab.items,...order.items],totalCents:tab.totalCents+order.total}:tab)})):s.tables; save({ ...s, tables, orders: [order, ...s.orders], audit: [{ id: uid("audit"), actor: endpoint.includes("internal") ? "Operação" : "Cliente", action: "ORDER_CREATED", entity: "order", entityId: order.id, createdAt: new Date().toISOString() }, ...s.audit] }); fire(endpoint, { method: "POST", headers: { "Idempotency-Key": order.sourceIdempotencyKey }, body: JSON.stringify({ ...order, ...(metadata || {}) }) }); },
  patchOrder(id: string, patch: Partial<Order>, actor = "Operação") {
    const s = load();
    const now = new Date().toISOString();
    save({ ...s, orders: s.orders.map(order => order.id === id ? { ...order, ...patch, updatedAt: now } : order), audit: [{ id: uid("audit"), actor, action: "ORDER_UPDATED", entity: "order", entityId: id, createdAt: now, details: "Comanda alterada pela operação" }, ...s.audit] });
  },
  patchDriver(id: string, patch: Partial<Driver>) { const s=load(); save({ ...s, drivers: s.drivers.map(driver => driver.id===id ? { ...driver, ...patch } : driver) }); },
  updateOrderStatus(id: string, status: OrderStatus, actor = "Operação") {
    const s = load();
    const now = new Date().toISOString();
    save({ ...s, orders: s.orders.map(o => o.id === id ? { ...o, status, updatedAt: now, paymentStatus: status === "completed" && o.paymentStatus === "pending" ? "paid" : o.paymentStatus } : o), audit: [{ id: uid("audit"), actor, action: "ORDER_STATUS_CHANGED", entity: "order", entityId: id, createdAt: now, details: status }, ...s.audit] });
    fire(`/api/orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
  },
  assignDriver(orderId: string, driverId: string) {
    const s = load(); const now = new Date().toISOString();
    save({ ...s, orders: s.orders.map(o => o.id === orderId ? { ...o, driverId, trackingToken: o.trackingToken || uid("track"), updatedAt: now } : o), drivers: s.drivers.map(d => d.id === driverId ? { ...d, available: false, activeOrderId: orderId } : d), audit: [{ id: uid("audit"), actor: "Atendente", action: "DRIVER_ASSIGNED", entity: "order", entityId: orderId, createdAt: now, details: driverId }, ...s.audit] });
    if (!isDemoMode() && typeof window !== "undefined") {
      fetch("/api/delivery/assign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId, driverId }) })
        .then(response => response.ok ? response.json() : Promise.reject())
        .then(body => { const current=load(); save({ ...current, orders: current.orders.map(order => order.id===orderId ? { ...order, trackingToken: body.trackingToken } : order) }); })
        .catch(() => undefined);
    }
  },
  updateDriverLocation(driverId: string, latitude: number, longitude: number) {
    const s = load(); const now = new Date().toISOString();
    save({ ...s, drivers: s.drivers.map(d => d.id === driverId ? { ...d, latitude, longitude, lastLocationAt: now } : d) });
    const orderId = s.drivers.find(d => d.id === driverId)?.activeOrderId;
    if (orderId) fire(`/api/drivers/${driverId}/location`, { method: "POST", body: JSON.stringify({ orderId, latitude, longitude, capturedAt: now }) });
  },
  completeDelivery(orderId: string, driverId: string) {
    const s = load(); const now = new Date().toISOString();
    save({ ...s, orders: s.orders.map(o => o.id === orderId ? { ...o, status: "completed", paymentStatus: "paid", updatedAt: now } : o), drivers: s.drivers.map(d => d.id === driverId ? { ...d, available: true, activeOrderId: undefined } : d), audit: [{ id: uid("audit"), actor: "Motoboy", action: "DELIVERY_COMPLETED", entity: "order", entityId: orderId, createdAt: now }, ...s.audit] });
    fire(`/api/orders/${orderId}/status`, { method: "PATCH", body: JSON.stringify({ status: "completed" }) });
  },

  openTab(tableNumber: number, name: string, people = 1, waiter = "Garçom 1", tabId = uid("tab"), syncRemote = true) {
    const s=load(); const now=new Date().toISOString(); const tab={id:tabId,name,items:[],paidCents:0,totalCents:0,waiter,status:"open" as const};
    if(!s.tables.some(table=>table.tabs.some(existing=>existing.id===tabId))){
      save({...s,tables:s.tables.map(table=>table.number===tableNumber?{...table,status:"occupied",people,openedAt:table.openedAt||now,tabs:[...table.tabs,tab]}:table),audit:[{id:uid("audit"),actor:waiter,action:"TAB_OPENED",entity:"tab",entityId:tab.id,createdAt:now,details:`Mesa ${tableNumber}`},...s.audit]});
    }
    if(syncRemote)fire(`/api/tables/${tableNumber}/tabs`,{method:"POST",body:JSON.stringify({name,people})});
    return tab.id;
  },
  transferTab(tabId: string, targetTable: number) {
    const s=load(); const now=new Date().toISOString(); let moved:any=null; let source=0;
    for(const table of s.tables){const found=table.tabs.find(tab=>tab.id===tabId);if(found){moved=found;source=table.number;break;}}
    if(!moved)return;
    save({...s,tables:s.tables.map(table=>{if(table.number===source){const tabs=table.tabs.filter(tab=>tab.id!==tabId);return {...table,tabs,status:tabs.length?table.status:"free",people:tabs.length?table.people:undefined,openedAt:tabs.length?table.openedAt:undefined};}if(table.number===targetTable)return {...table,status:"occupied",openedAt:table.openedAt||now,tabs:[...table.tabs,moved]};return table;}),orders:s.orders.map(order=>order.tabId===tabId?{...order,tableNumber:targetTable,updatedAt:now}:order),audit:[{id:uid("audit"),actor:"Operação",action:"TAB_TRANSFERRED",entity:"tab",entityId:tabId,createdAt:now,details:`Mesa ${source} → ${targetTable}`},...s.audit]});
    fire(`/api/tabs/${tabId}`,{method:"PATCH",body:JSON.stringify({action:"transfer",targetTable})});
  },
  payTab(tabId: string, amount: number, method: PaymentMethod) {
    const s=load(); const now=new Date().toISOString();
    const target=s.tables.flatMap(table=>table.tabs).find(tab=>tab.id===tabId);
    if(!target||amount<=0)return;
    const paid=Math.min(target.totalCents,target.paidCents+amount);
    const closed=target.totalCents>0&&paid>=target.totalCents;
    const tables=s.tables.map(table=>{
      const tabs=table.tabs.map(tab=>tab.id===tabId?{...tab,paidCents:paid,status:closed?"closed" as const:"partial" as const}:tab);
      const openTabs=tabs.filter(tab=>tab.status==="open"||tab.status==="partial");
      return {...table,tabs,status:openTabs.length?closed?table.status:"partial" as const:"free" as const,people:openTabs.length?table.people:undefined,openedAt:openTabs.length?table.openedAt:undefined,groupId:openTabs.length?table.groupId:undefined};
    });
    save({...s,tables,orders:s.orders.map(order=>order.tabId===tabId?{...order,paymentStatus:closed?"paid":"partial",status:closed?"completed":order.status,updatedAt:now}:order),audit:[{id:uid("audit"),actor:"Operação",action:"TAB_PAYMENT_RECORDED",entity:"tab",entityId:tabId,createdAt:now,details:`${method}: ${amount}`},...s.audit]});
    fire(`/api/tabs/${tabId}/payments`,{method:"POST",body:JSON.stringify({amount,method,idempotencyKey:uid("tabpay")})});
  },
  groupTables(tableNumbers: number[]) {
    const s=load(); const now=new Date().toISOString(); const groupId=uid("group");
    save({...s,tables:s.tables.map(table=>tableNumbers.includes(table.number)?{...table,groupId,status:table.status==="free"?"occupied":table.status,openedAt:table.openedAt||now}:table),audit:[{id:uid("audit"),actor:"Operação",action:"TABLES_GROUPED",entity:"table_group",entityId:groupId,createdAt:now,details:tableNumbers.join(", ")},...s.audit]});
    fire("/api/tables/groups",{method:"POST",body:JSON.stringify({tableNumbers})});
  },
  ungroupTable(tableNumber: number) { const s=load(); const now=new Date().toISOString(); save({...s,tables:s.tables.map(table=>table.number===tableNumber?{...table,groupId:undefined}:table),audit:[{id:uid("audit"),actor:"Operação",action:"TABLE_UNGROUPED",entity:"table",entityId:String(tableNumber),createdAt:now},...s.audit]}); fire(`/api/tables/${tableNumber}/group`,{method:"DELETE"}); },
  setTableStatus(number: number, status: DemoTable["status"], people?: number) {
    const s = load(); const now = new Date().toISOString();
    save({ ...s, tables: s.tables.map(t => t.number === number ? { ...t, status, people, openedAt: status === "occupied" && !t.openedAt ? now : status === "free" ? undefined : t.openedAt, tabs: status === "free" ? [] : t.tabs } : t), audit: [{ id: uid("audit"), actor: "Garçom", action: "TABLE_STATUS_CHANGED", entity: "table", entityId: String(number), createdAt: now, details: status }, ...s.audit] });
    fire(`/api/tables/${number}`, { method: "PATCH", body: JSON.stringify({ status, people }) });
  },
  updateInventory(id: string, delta: number, reason: string) {
    const s = load(); const now = new Date().toISOString();
    save({ ...s, inventory: s.inventory.map(i => i.id === id ? { ...i, quantity: i.quantity + delta, updatedAt: now } : i), audit: [{ id: uid("audit"), actor: "Gestor", action: "INVENTORY_ADJUSTED", entity: "inventory", entityId: id, createdAt: now, details: `${delta}: ${reason}` }, ...s.audit] });
    fire(`/api/inventory/${id}`, { method: "POST", body: JSON.stringify({ delta, reason, idempotencyKey: uid("stock") }) });
  },
  addCoupon(coupon: Coupon) { const s = load(); save({ ...s, coupons: [coupon, ...s.coupons] }); fire("/api/coupons", { method: "POST", body: JSON.stringify(coupon) }); },
  recordCashMovement(kind: "supply" | "withdrawal" | "adjustment", amount: number, reason: string) {
    const s=load(); const now=new Date().toISOString(); const signed=kind==="withdrawal"?-Math.abs(amount):Math.abs(amount);
    save({ ...s, cashMovements: [{ id:uid("cash"),kind,amount:signed,reason,createdAt:now,actor:"Operação" },...s.cashMovements], audit:[{id:uid("audit"),actor:"Operação",action:"CASH_MOVEMENT_CREATED",entity:"cash_movement",entityId:uid("cashref"),createdAt:now,details:`${kind}: ${reason}`},...s.audit] });
    fire("/api/cash",{method:"POST",body:JSON.stringify({action:"movement",kind,amount:Math.abs(amount),reason})});
  },
  addFinancialEntry(entry: FinancialEntry) { const s=load(); save({...s,financialEntries:[entry,...s.financialEntries]}); fire("/api/financial",{method:"POST",body:JSON.stringify({kind:entry.kind,description:entry.description,categoryId:entry.categoryId||null,amount:entry.amount,dueDate:entry.dueDate,status:entry.status==="settled"?"settled":"pending",paymentMethod:entry.paymentMethod||null,recurring:entry.recurring,notes:entry.notes})}); },
  updateFinancialEntry(id:string,status:"pending"|"settled"|"cancelled",paymentMethod:PaymentMethod="pix") { const s=load(); const now=new Date().toISOString(); save({...s,financialEntries:s.financialEntries.map(entry=>entry.id===id?{...entry,status,settledAt:status==="settled"?now:undefined,paymentMethod:status==="settled"?paymentMethod:undefined}:entry)}); fire(`/api/financial/${id}`,{method:"PATCH",body:JSON.stringify(status==="settled"?{action:"settle",paymentMethod}:status==="cancelled"?{action:"cancel",reason:"Cancelado pela operação"}:{action:"restore"})}); },
  addCampaign(campaign: CampaignRecord) { const s=load(); save({...s,campaigns:[campaign,...s.campaigns]}); fire("/api/campaigns",{method:"POST",body:JSON.stringify({name:campaign.name,channel:campaign.channel,segment:campaign.segment,template:campaign.template,scheduledAt:campaign.scheduledAt||null})}); },
  updateCampaign(id:string,status:CampaignRecord["status"],metrics?:CampaignRecord["metrics"]) { const s=load(); save({...s,campaigns:s.campaigns.map(c=>c.id===id?{...c,status,metrics:metrics||c.metrics}:c)}); },
  toggleCash(open: boolean, initial = 0, declared?: number, notes?: string) { const s = load(); save({ ...s, cashOpen: open, cashInitial: open ? initial : s.cashInitial, cashOpenedAt: open ? new Date().toISOString() : undefined, cashMovements: open ? [] : s.cashMovements }); fire("/api/cash", { method: "POST", body: JSON.stringify(open ? { action:"open", initial } : { action:"close", declared:declared ?? s.cashInitial+s.cashMovements.reduce((sum,m)=>sum+m.amount,0), notes }) }); }
};
