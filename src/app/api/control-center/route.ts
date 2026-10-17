import { isOrderDelayed } from "@/lib/operational-totals";
import { NextResponse } from "next/server";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapStoreRuntime } from "@/lib/admin-control";
import type { ControlCenterSnapshot } from "@/types";

function startOfTodayIso() {
  const localDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return `${localDate}T03:00:00.000Z`;
}

export async function GET() {
  try {
    await requireOperationalRole(
      ["manager", "counter", "waiter", "kitchen", "bar", "driver", "finance", "viewer"],
      "orders.view",
    );
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });

    const today = startOfTodayIso();
    const activeStatuses = ["received", "confirmed", "preparing", "ready", "out_for_delivery"];

    const [
      storeResult,
      cashResult,
      activeOrdersResult,
      todayOrdersResult,
      tablesResult,
      tabsResult,
      driversResult,
      stockResult,
      printResult,
      integrationsResult,
      syncResult,
      usersResult,
      tasksResult,
      approvalsResult,
      notificationsResult,
      incidentsResult,
    ] = await Promise.all([
      db.from("store_runtime_status").select("*").eq("id", true).single(),
      db.from("cash_sessions").select("*").eq("status", "open").order("opened_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("orders").select("id,status,payment_status,channel,created_at,viewed_at,estimated_ready_at,total_cents", { count: "exact" }).in("status", activeStatuses).is("deleted_at", null),
      db.from("orders").select("id,status,payment_status,total_cents,created_at").gte("created_at", today).is("deleted_at", null),
      db.from("restaurant_tables").select("number,status"),
      db.from("tabs").select("id,status").in("status", ["open", "partial"]),
      db.from("drivers").select("id,available,active_order_id").eq("active", true),
      db.from("inventory_items").select("quantity,minimum_quantity"),
      db.from("print_jobs").select("id", { count: "exact", head: true }).eq("status", "failed"),
      db.from("integration_events").select("id", { count: "exact", head: true }).in("status", ["failed", "dead_letter"]),
      db.from("sync_queue").select("id", { count: "exact", head: true }).in("status", ["queued", "failed"]),
      db.from("profiles").select("id,last_seen_at").eq("active", true),
      db.from("operation_tasks").select("id", { count: "exact", head: true }).in("status", ["open", "in_progress", "blocked"]),
      db.from("approval_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
      db.from("internal_notifications").select("id", { count: "exact", head: true }).is("read_at", null).is("dismissed_at", null),
      db.from("order_incidents").select("id", { count: "exact", head: true }).eq("status", "open"),
    ]);

    const results = [
      storeResult,
      cashResult,
      activeOrdersResult,
      todayOrdersResult,
      tablesResult,
      tabsResult,
      driversResult,
      stockResult,
      printResult,
      integrationsResult,
      syncResult,
      usersResult,
      tasksResult,
      approvalsResult,
      notificationsResult,
      incidentsResult,
    ];
    const failed = results.find((result) => result.error);
    if (failed?.error) throw failed.error;

    const activeOrders = (activeOrdersResult.data || []) as Array<Record<string, unknown>>;
    const todayOrders = (todayOrdersResult.data || []) as Array<Record<string, unknown>>;
    const paidToday = todayOrders.filter((order) => order.payment_status === "paid" && order.status !== "cancelled");
    const revenueToday = paidToday.reduce((sum, order) => sum + Number(order.total_cents || 0), 0);
    const completedToday = todayOrders.filter((order) => order.status === "completed").length;
    const cancelledToday = todayOrders.filter((order) => order.status === "cancelled").length;
    const averageTicket = paidToday.length ? Math.round(revenueToday / paidToday.length) : 0;
    const delayed = activeOrders.filter(order => isOrderDelayed({
      status: String(order.status), createdAt: String(order.created_at),
      estimatedReadyAt: typeof order.estimated_ready_at === "string" ? order.estimated_ready_at : undefined,
    })).length;

    const tables = (tablesResult.data || []) as Array<Record<string, unknown>>;
    const drivers = (driversResult.data || []) as Array<Record<string, unknown>>;
    const inventory = (stockResult.data || []) as Array<Record<string, unknown>>;
    const users = (usersResult.data || []) as Array<Record<string, unknown>>;
    const activeUsers = users.filter((user) => {
      if (typeof user.last_seen_at !== "string") return false;
      return Date.now() - new Date(user.last_seen_at).getTime() <= 15 * 60_000;
    }).length;

    const cash = cashResult.data as Record<string, unknown> | null;
    let cashExpected = 0;
    if (cash?.id) {
      const { data: movements, error } = await db
        .from("cash_movements")
        .select("amount_cents")
        .eq("session_id", cash.id);
      if (error) throw error;
      cashExpected = Number(cash.initial_cents || 0) + (movements || []).reduce((sum: number, movement: { amount_cents?: number }) => sum + Number(movement.amount_cents || 0), 0);
    }

    const snapshot: ControlCenterSnapshot = {
      generatedAt: new Date().toISOString(),
      store: mapStoreRuntime((storeResult.data || {}) as Record<string, unknown>),
      cash: {
        open: Boolean(cash),
        openedAt: typeof cash?.opened_at === "string" ? cash.opened_at : undefined,
        initial: Number(cash?.initial_cents || 0),
        expected: cashExpected,
      },
      orders: {
        active: activeOrders.length,
        received: activeOrders.filter((order) => order.status === "received").length,
        preparing: activeOrders.filter((order) => order.status === "preparing").length,
        ready: activeOrders.filter((order) => order.status === "ready").length,
        delayed,
        unviewed: activeOrders.filter((order) => !order.viewed_at).length,
        unpaid: activeOrders.filter((order) => order.payment_status !== "paid").length,
        delivery: activeOrders.filter((order) => order.channel === "own_delivery").length,
        completedToday,
        cancelledToday,
        revenueToday,
        averageTicket,
      },
      salon: {
        occupiedTables: tables.filter((table) => table.status !== "free").length,
        openTabs: tabsResult.data?.length || 0,
        partialTables: tables.filter((table) => table.status === "partial").length,
      },
      delivery: {
        availableDrivers: drivers.filter((driver) => driver.available).length,
        totalDrivers: drivers.length,
        activeDeliveries: drivers.filter((driver) => driver.active_order_id).length,
        waitingDriver: activeOrders.filter((order) => order.status === "ready" && order.channel === "own_delivery").length,
      },
      stock: {
        lowItems: inventory.filter((item) => Number(item.quantity) <= Number(item.minimum_quantity)).length,
        outItems: inventory.filter((item) => Number(item.quantity) <= 0).length,
      },
      reliability: {
        failedPrintJobs: printResult.count || 0,
        failedIntegrationEvents: integrationsResult.count || 0,
        pendingSync: syncResult.count || 0,
      },
      people: { activeUsers },
      pending: {
        tasks: tasksResult.count || 0,
        approvals: approvalsResult.count || 0,
        notifications: notificationsResult.count || 0,
        incidents: incidentsResult.count || 0,
      },
    };

    return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao carregar o centro de comando.";
    const migrationHint = /operation_tasks|approval_requests|internal_notifications|last_seen_at/i.test(message)
      ? " Execute a migration 014_autonomy_operations_and_control.sql."
      : "";
    return NextResponse.json({ error: `${message}${migrationHint}` }, { status: 400 });
  }
}
