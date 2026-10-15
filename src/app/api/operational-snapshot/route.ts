import { NextResponse } from "next/server";
import { requireOperationalRole } from "@/lib/authz";
import { snapshotAccess } from "@/lib/operational-access";
import { createAdminClient } from "@/lib/supabase/admin";

const ACTIVE_ORDER_STATUSES = ["received", "confirmed", "preparing", "ready", "out_for_delivery"];

function warningFrom(label: string, error: unknown) {
  const message = error && typeof error === "object" && "message" in error ? String((error as { message?: unknown }).message || "") : String(error || "");
  return `${label}: ${message || "consulta indisponível"}`;
}

export async function GET() {
  try {
    const auth = await requireOperationalRole(["manager", "counter", "waiter", "kitchen", "bar", "driver", "finance", "viewer"], "orders.view");
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });

    const warnings: string[] = [];
    const access = snapshotAccess(auth);
    const hidden = () => Promise.resolve({ data: [] as any[], error: null });
    const hiddenCash = () => Promise.resolve({ data: null, error: null });

    // Núcleo crítico: se uma destas consultas falhar, não fabricamos uma operação vazia.
    const [recentOrdersR, tablesR, tabsR, driversR] = await Promise.all([
      db.from("orders").select("*").is("deleted_at", null).order("created_at", { ascending: false }).limit(250),
      db.from("restaurant_tables").select("*").order("number"),
      db.from("tabs").select("*").in("status", ["open", "partial"]),
      db.from("drivers").select("*").eq("active", true),
    ]);

    for (const [label, result] of [
      ["Pedidos", recentOrdersR],
      ["Mesas", tablesR],
      ["Comandas", tabsR],
      ["Motoboys", driversR],
    ] as const) {
      if (result.error) throw new Error(warningFrom(label, result.error));
    }

    // Comandas abertas podem conter pedidos mais antigos que a janela dos 250 recentes.
    const openTabIds = (tabsR.data || []).map((tab: any) => String(tab.id)).filter(Boolean);
    let tabOrders: any[] = [];
    if (openTabIds.length) {
      const tabOrdersR = await db.from("orders").select("*").is("deleted_at", null).in("tab_id", openTabIds);
      if (tabOrdersR.error) warnings.push(warningFrom("Pedidos de comandas", tabOrdersR.error));
      else tabOrders = tabOrdersR.data || [];
    }

    const byId = new Map<string, any>();
    for (const order of [...(recentOrdersR.data || []), ...tabOrders]) byId.set(String(order.id), order);
    const rawOrders = [...byId.values()].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    const orderIds = rawOrders.map((order) => String(order.id)).filter(Boolean);

    // Itens são buscados SOMENTE para os pedidos carregados; não usamos mais os 2.000 itens históricos mais antigos.
    let rawItems: any[] = [];
    if (orderIds.length) {
      const itemsR = await db.from("order_items").select("*").in("order_id", orderIds).order("created_at", { ascending: true });
      if (itemsR.error) throw new Error(warningFrom("Itens dos pedidos", itemsR.error));
      rawItems = itemsR.data || [];
    }

    // Domínios auxiliares não podem derrubar KDS/Delivery/Salão caso uma consulta isolada falhe.
    const [inventoryR, productsR, couponsR, eventsR, auditR, cashR, financialR, campaignsR] = await Promise.all([
      access.inventory ? db.from("inventory_items").select("*") : hidden(),
      db.from("products").select("id,name,category"),
      access.coupons ? db.from("coupons").select("*").order("created_at", { ascending: false }) : hidden(),
      access.integrations ? db.from("integration_events").select("id,provider,event_type,status,created_at,attempts").order("created_at", { ascending: false }).limit(50) : hidden(),
      access.audit ? db.from("audit_logs").select("id,actor_label,action,entity_type,entity_id,created_at,reason").order("created_at", { ascending: false }).limit(100) : hidden(),
      access.cash ? db.from("cash_sessions").select("*").eq("status", "open").order("opened_at", { ascending: false }).limit(1).maybeSingle() : hiddenCash(),
      access.finance ? db.from("financial_entries").select("*,financial_categories(name)").is("deleted_at", null).order("due_date", { ascending: false }).limit(200) : hidden(),
      access.campaigns ? db.from("campaigns").select("*").order("created_at", { ascending: false }).limit(100) : hidden(),
    ]);

    const optional = [
      ["Estoque", inventoryR], ["Produtos", productsR], ["Cupons", couponsR], ["Integrações", eventsR],
      ["Auditoria", auditR], ["Caixa", cashR], ["Financeiro", financialR], ["Campanhas", campaignsR],
    ] as const;
    for (const [label, result] of optional) if (result.error) warnings.push(warningFrom(label, result.error));

    const productMap = new Map((productsR.error ? [] : productsR.data || []).map((product: any) => [product.id, product]));
    const itemsByOrder = new Map<string, any[]>();
    for (const item of rawItems) {
      const orderId = String(item.order_id);
      const array = itemsByOrder.get(orderId) || [];
      array.push({
        id: String(item.id),
        kind: item.kind,
        name: item.name_snapshot || "Item",
        quantity: Number(item.quantity || 1),
        unitPrice: Number(item.unit_price_cents || 0),
        productId: item.product_id || undefined,
        selection: item.selection && typeof item.selection === "object" ? item.selection : undefined,
        sector: item.sector || (item.kind === "product" ? "bar" : "kitchen"),
        productionStatus: item.production_status || "queued",
        cancelledReason: item.cancelled_reason || undefined,
        updatedAt: item.updated_at || undefined,
      });
      itemsByOrder.set(orderId, array);
    }

    const orders = rawOrders.map((order: any) => ({
      id: String(order.id),
      number: Number(order.number || 0),
      channel: order.channel,
      status: order.status,
      paymentStatus: order.payment_status || "pending",
      customerName: order.customer_name || "Cliente",
      customerPhone: order.customer_phone || "",
      customerId: order.customer_id || undefined,
      address: order.address && typeof order.address === "object" ? order.address : undefined,
      tableNumber: order.table_number || undefined,
      tabId: order.tab_id || undefined,
      items: itemsByOrder.get(String(order.id)) || [],
      subtotal: Number(order.subtotal_cents || 0),
      discount: Number(order.discount_cents || 0),
      deliveryFee: Number(order.delivery_fee_cents || 0),
      total: Number(order.total_cents || 0),
      paymentMethod: order.payment_method || "cash",
      changeFor: order.change_for_cents || undefined,
      notes: order.notes || undefined,
      couponCode: order.coupon_code || undefined,
      createdAt: order.created_at,
      updatedAt: order.updated_at || order.created_at,
      driverId: order.driver_id || undefined,
      sourceIdempotencyKey: order.source_idempotency_key || String(order.id),
      origin: order.order_origin || undefined,
      externalId: order.external_id || undefined,
      priority: order.priority || "normal",
      estimatedReadyAt: order.estimated_ready_at || undefined,
      viewedAt: order.viewed_at || undefined,
      assignedTo: order.assigned_to || undefined,
      internalSummary: order.internal_summary || undefined,
      servedAt: order.served_at || undefined,
      version: Number(order.version || 1),
    }));

    const tabsByTable = new Map<number, any[]>();
    for (const tab of tabsR.data || []) {
      const tabOrdersForCurrent = orders.filter((order: any) => order.tabId === tab.id && order.status !== "cancelled");
      const array = tabsByTable.get(Number(tab.table_number)) || [];
      array.push({
        id: tab.id,
        name: tab.name || "Comanda",
        items: tabOrdersForCurrent.flatMap((order: any) => order.items),
        paidCents: Number(tab.paid_cents || 0),
        totalCents: tabOrdersForCurrent.reduce((sum: number, order: any) => sum + Number(order.total || 0), 0),
        serviceChargeRate: Number(tab.service_charge_rate_percent || 10),
        serviceChargeApplied: tab.service_charge_applied !== false,
        serviceChargeCents: Number(tab.service_charge_cents || 0),
        waiter: "Equipe",
        status: tab.status || "open",
      });
      tabsByTable.set(Number(tab.table_number), array);
    }

    const tables = (tablesR.data || []).map((table: any) => ({
      number: Number(table.number),
      capacity: Number(table.capacity || 2),
      status: table.status || "free",
      people: table.people_count || undefined,
      openedAt: table.opened_at || undefined,
      groupId: table.group_id || undefined,
      tabs: tabsByTable.get(Number(table.number)) || [],
    }));

    const drivers = (driversR.data || []).map((driver: any) => ({
      id: driver.id,
      name: driver.name || "Motoboy",
      phone: driver.phone || "",
      vehicle: driver.vehicle || "Moto",
      available: Boolean(driver.available),
      latitude: driver.last_latitude == null ? undefined : Number(driver.last_latitude),
      longitude: driver.last_longitude == null ? undefined : Number(driver.last_longitude),
      lastLocationAt: driver.last_location_at || undefined,
      activeOrderId: driver.active_order_id || undefined,
      shiftActive: Boolean(driver.shift_started_at) && (!driver.shift_ended_at || Date.parse(driver.shift_started_at) > Date.parse(driver.shift_ended_at)),
      shiftStartedAt: driver.shift_started_at || undefined,
      shiftEndedAt: driver.shift_ended_at || undefined,
    }));

    const inventory = (inventoryR.error ? [] : inventoryR.data || []).map((item: any) => {
      const product = productMap.get(item.product_id) as any;
      return {
        id: item.id,
        productId: item.product_id,
        name: product?.name || item.product_id,
        unit: item.unit,
        quantity: Number(item.quantity || 0),
        minQuantity: Number(item.minimum_quantity || 0),
        allowNegative: Boolean(item.allow_negative),
        updatedAt: item.updated_at,
      };
    });

    const coupons = (couponsR.error ? [] : couponsR.data || []).map((coupon: any) => ({
      id: coupon.id,
      code: coupon.code,
      type: coupon.discount_type,
      value: coupon.value,
      totalLimit: coupon.total_limit,
      uses: coupon.uses,
      minimum: coupon.minimum_cents,
      channels: Array.isArray(coupon.channels) ? coupon.channels : [],
      active: Boolean(coupon.active),
      startsAt: coupon.starts_at || undefined,
      endsAt: coupon.ends_at || undefined,
    }));

    const integrationEvents = (eventsR.error ? [] : eventsR.data || []).map((event: any) => ({
      id: event.id,
      provider: event.provider,
      type: event.event_type,
      status: event.status === "done" ? "ok" : event.status === "failed" ? "error" : "pending",
      createdAt: event.created_at,
      attempts: Number(event.attempts || 0),
    }));

    const audit = (auditR.error ? [] : auditR.data || []).map((entry: any) => ({
      id: String(entry.id),
      actor: entry.actor_label || "Sistema",
      action: entry.action,
      entity: entry.entity_type,
      entityId: entry.entity_id,
      createdAt: entry.created_at,
      details: entry.reason || undefined,
    }));

    const cash = cashR.error ? null : cashR.data as any;
    let cashMovements: any[] = [];
    if (cash) {
      const movementsR = await db.from("cash_movements").select("id,kind,amount_cents,reason,created_at").eq("session_id", cash.id).order("created_at", { ascending: false });
      if (movementsR.error) warnings.push(warningFrom("Movimentações do caixa", movementsR.error));
      else cashMovements = (movementsR.data || []).map((movement: any) => ({
        id: movement.id,
        kind: movement.kind,
        amount: Number(movement.amount_cents || 0),
        reason: movement.reason || "Movimentação",
        createdAt: movement.created_at,
        actor: "Equipe",
      }));
    }

    const financialEntries = (financialR.error ? [] : financialR.data || []).map((entry: any) => ({
      id: entry.id,
      kind: entry.kind,
      status: entry.status,
      description: entry.description,
      categoryId: entry.category_id || undefined,
      categoryName: entry.financial_categories?.name || "Sem categoria",
      amount: Number(entry.amount_cents || 0),
      dueDate: entry.due_date,
      settledAt: entry.settled_at || undefined,
      paymentMethod: entry.payment_method || undefined,
      recurring: Boolean(entry.recurring),
      notes: entry.notes || undefined,
      createdAt: entry.created_at,
    }));

    const campaigns = (campaignsR.error ? [] : campaignsR.data || []).map((campaign: any) => ({
      id: campaign.id,
      name: campaign.name,
      channel: campaign.channel,
      segment: campaign.segment || { type: "all" },
      template: campaign.template || { title: "", message: "" },
      status: campaign.status,
      scheduledAt: campaign.scheduled_at || undefined,
      createdAt: campaign.created_at,
      metrics: { recipients: 0, sent: 0, opened: 0, converted: 0 },
    }));

    return NextResponse.json({
      snapshotVersion: 9,
      generatedAt: new Date().toISOString(),
      warnings,
      orders,
      tables,
      drivers,
      inventory,
      coupons,
      integrationEvents,
      audit,
      cashOpen: Boolean(cash),
      cashInitial: Number(cash?.initial_cents || 0),
      cashOpenedAt: cash?.opened_at || undefined,
      cashMovements,
      financialEntries,
      campaigns,
      activeOrderCount: orders.filter((order: any) => ACTIVE_ORDER_STATUSES.includes(order.status)).length,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao carregar operação.";
    const authError = /sess[aã]o|login|n[aã]o autorizado|permiss|jwt|auth/i.test(message);
    return NextResponse.json({ error: message }, { status: authError ? 401 : 500, headers: { "Cache-Control": "no-store" } });
  }
}

