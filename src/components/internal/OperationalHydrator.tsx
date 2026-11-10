"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { demoActions } from "@/lib/demo-store";
import { normalizeOperationalSnapshot } from "@/lib/stable-store";
import { createClient } from "@/lib/supabase/client";
import { isDemoMode } from "@/lib/utils";
import { flushOfflineOperations } from "@/lib/offline-queue";

export type OperationalStatusDetail = {
  status: "loading" | "online" | "offline" | "error";
  message?: string;
  lastSyncAt?: string;
  snapshotVersion?: number;
};

function publishStatus(detail: OperationalStatusDetail) {
  window.dispatchEvent(new CustomEvent<OperationalStatusDetail>("lfb:operational-status", { detail }));
}

export function OperationalHydrator() {
  const router = useRouter();

  useEffect(() => {
    if (isDemoMode()) {
      publishStatus({ status: "online", message: "Modo demonstração", lastSyncAt: new Date().toISOString(), snapshotVersion: 9 });
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let refreshing = false;
    let queuedRefresh = false;
    let controller: AbortController | null = null;

    const refresh = async (silent = false) => {
      if (refreshing) {
        queuedRefresh = true;
        return;
      }
      refreshing = true;
      controller?.abort();
      controller = new AbortController();
      if (!silent) publishStatus({ status: "loading", message: "Sincronizando operação" });
      try {
        const response = await fetch("/api/operational-snapshot", {
          cache: "no-store",
          signal: controller.signal,
          headers: { "X-PedidoPro-Snapshot": "9" },
        });
        const body = await response.json().catch(() => null) as (Record<string, unknown> & { error?: string; snapshotVersion?: number }) | null;

        if (!response.ok) {
          const message = typeof body?.error === "string" ? body.error : "Não foi possível carregar os dados operacionais.";
          if (response.status === 401 || response.status === 403) {
            publishStatus({ status: "error", message: "Sessão inválida ou sem permissão. Entre novamente." });
            router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
            return;
          }
          publishStatus({ status: response.status >= 500 ? "offline" : "error", message });
          return;
        }

        if (!cancelled && body) {
          const normalized = normalizeOperationalSnapshot(body);
          demoActions.replaceSnapshot(normalized);
        }
        publishStatus({
          status: "online",
          message: Array.isArray(body?.warnings) && body.warnings.length ? "Dados sincronizados com alertas" : "Dados sincronizados",
          lastSyncAt: new Date().toISOString(),
          snapshotVersion: Number(body?.snapshotVersion || 9),
        });
      } catch (error) {
        if ((error as Error)?.name !== "AbortError") {
          publishStatus({ status: "offline", message: "Sem conexão com o servidor. Ações críticas estão bloqueadas até reconectar." });
        }
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
      timer = setTimeout(() => void refresh(true), 450);
    };

    void refresh();
    void flushOfflineOperations().then((result) => {
      if (result.processed > 0) void refresh(true);
    });

    // Fallback leve para navegadores que suspendem ou perdem o Realtime.
    pollTimer = setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) void refresh(true);
    }, 45_000);

    const onOnline = () => {
      publishStatus({ status: "loading", message: "Conexão restaurada. Reconciliando dados..." });
      void flushOfflineOperations().then(() => refresh(true));
    };
    const onOffline = () => publishStatus({ status: "offline", message: "Sem internet. Alterações financeiras e destrutivas não serão confirmadas offline." });
    const onExplicitRefresh = () => void refresh(true);
    const onVisibility = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void refresh(true);
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("lfb:refresh-operation", onExplicitRefresh);
    document.addEventListener("visibilitychange", onVisibility);

    const client = createClient();
    const realtime = client?.channel("operational-ui-v9");
    const tables = [
      "orders", "order_items", "payments", "restaurant_tables", "tabs", "drivers", "inventory_items",
      "coupons", "cash_sessions", "cash_movements", "financial_entries",
      "store_runtime_status", "operation_tasks", "approval_requests", "internal_notifications", "print_jobs",
      "campaigns", "campaign_recipients", "customers", "business_settings", "products", "pizza_flavors", "addons", "categories", "delivery_zones", "promotions", "promotion_targets"
    ];
    for (const table of tables) realtime?.on("postgres_changes", { event: "*", schema: "public", table }, debounceRefresh);
    realtime?.subscribe((realtimeStatus) => {
      if (realtimeStatus === "CHANNEL_ERROR" || realtimeStatus === "TIMED_OUT") {
        publishStatus({ status: navigator.onLine ? "error" : "offline", message: "Realtime temporariamente indisponível. O sistema continuará atualizando por reconciliação." });
      }
    });

    return () => {
      cancelled = true;
      controller?.abort();
      clearTimeout(timer);
      if (pollTimer) clearInterval(pollTimer);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("lfb:refresh-operation", onExplicitRefresh);
      document.removeEventListener("visibilitychange", onVisibility);
      if (client && realtime) client.removeChannel(realtime);
    };
  }, [router]);

  return null;
}

