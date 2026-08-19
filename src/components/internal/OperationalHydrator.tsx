"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { demoActions, type DemoState } from "@/lib/demo-store";
import { createClient } from "@/lib/supabase/client";
import { isDemoMode } from "@/lib/utils";
import { flushOfflineOperations } from "@/lib/offline-queue";

export type OperationalStatusDetail = {
  status: "loading" | "online" | "offline" | "error";
  message?: string;
  lastSyncAt?: string;
};

function publishStatus(detail: OperationalStatusDetail) {
  window.dispatchEvent(new CustomEvent<OperationalStatusDetail>("lfb:operational-status", { detail }));
}

export function OperationalHydrator() {
  const router = useRouter();

  useEffect(() => {
    if (isDemoMode()) {
      publishStatus({ status: "online", message: "Modo demonstração", lastSyncAt: new Date().toISOString() });
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let refreshing = false;
    let queuedRefresh = false;

    const refresh = async (silent = false) => {
      if (refreshing) {
        queuedRefresh = true;
        return;
      }
      refreshing = true;
      if (!silent) publishStatus({ status: "loading", message: "Sincronizando operação" });
      try {
        const response = await fetch("/api/operational-snapshot", { cache: "no-store" });
        const body = (await response.json().catch(() => null)) as (Partial<DemoState> & { error?: string }) | null;

        if (!response.ok) {
          const message = body?.error || "Não foi possível carregar os dados operacionais.";
          publishStatus({ status: response.status === 503 ? "offline" : "error", message });
          if (response.status === 401 && /sessão inválida|expirada|não autorizado/i.test(message)) router.replace("/login");
          return;
        }

        if (!cancelled && body) demoActions.replaceSnapshot(body);
        publishStatus({ status: "online", message: "Dados sincronizados", lastSyncAt: new Date().toISOString() });
      } catch {
        publishStatus({ status: "offline", message: "Sem conexão com o servidor. Ações críticas estão bloqueadas até reconectar." });
      } finally {
        refreshing = false;
        if (queuedRefresh && !cancelled) {
          queuedRefresh = false;
          void refresh(true);
        }
      }
    };

    const debounceRefresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(true), 220);
    };

    void refresh();
    void flushOfflineOperations().then((result) => {
      if (result.processed > 0) void refresh(true);
    });

    const onOnline = () => {
      publishStatus({ status: "loading", message: "Conexão restaurada. Reconciliando dados..." });
      void flushOfflineOperations().then(() => refresh(true));
    };
    const onOffline = () => publishStatus({ status: "offline", message: "Sem internet. Alterações financeiras e destrutivas não serão confirmadas offline." });
    const onExplicitRefresh = () => void refresh(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("lfb:refresh-operation", onExplicitRefresh);

    const client = createClient();
    const realtime = client?.channel("operational-ui");
    const tables = [
      "orders", "order_items", "payments", "restaurant_tables", "tabs", "drivers", "inventory_items",
      "coupons", "cash_sessions", "cash_movements", "financial_entries", "integration_events", "audit_logs",
      "store_runtime_status", "operation_tasks", "approval_requests", "internal_notifications", "print_jobs",
      "campaigns", "campaign_recipients", "customers"
    ];
    for (const table of tables) realtime?.on("postgres_changes", { event: "*", schema: "public", table }, debounceRefresh);
    realtime?.subscribe();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("lfb:refresh-operation", onExplicitRefresh);
      if (client && realtime) client.removeChannel(realtime);
    };
  }, [router]);

  return null;
}
