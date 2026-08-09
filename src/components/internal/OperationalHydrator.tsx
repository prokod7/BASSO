"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { demoActions, type DemoState } from "@/lib/demo-store";
import { createClient } from "@/lib/supabase/client";
import { isDemoMode } from "@/lib/utils";
import { flushOfflineOperations } from "@/lib/offline-queue";

export type OperationalStatusDetail = {
  status: "loading" | "online" | "error";
  message?: string;
};

function publishStatus(detail: OperationalStatusDetail) {
  window.dispatchEvent(new CustomEvent<OperationalStatusDetail>("lfb:operational-status", { detail }));
}

export function OperationalHydrator() {
  const router = useRouter();

  useEffect(() => {
    if (isDemoMode()) {
      publishStatus({ status: "online", message: "Modo demonstração" });
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const refresh = async () => {
      publishStatus({ status: "loading", message: "Sincronizando operação" });
      try {
        const response = await fetch("/api/operational-snapshot", { cache: "no-store" });
        const body = (await response.json().catch(() => null)) as
          | (Partial<DemoState> & { error?: string })
          | null;

        if (!response.ok) {
          const message = body?.error || "Não foi possível carregar os dados operacionais.";
          publishStatus({ status: "error", message });
          if (response.status === 401 && /sessão inválida|expirada/i.test(message)) {
            router.replace("/login");
          }
          return;
        }

        if (!cancelled && body) demoActions.replaceSnapshot(body);
        publishStatus({ status: "online", message: "Dados sincronizados" });
      } catch {
        publishStatus({
          status: "error",
          message: "Sem conexão com o servidor. Exibindo a última sincronização disponível.",
        });
      }
    };

    const debounceRefresh = () => {
      clearTimeout(timer);
      timer = setTimeout(refresh, 250);
    };

    refresh();
    flushOfflineOperations().then((result) => {
      if (result.processed > 0) refresh();
    });

    const onOnline = () =>
      flushOfflineOperations().then((result) => {
        if (result.processed > 0) refresh();
        else refresh();
      });
    window.addEventListener("online", onOnline);
    window.addEventListener("lfb:refresh-operation", debounceRefresh);

    const client = createClient();
    const channel = client
      ?.channel("operational-ui")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, debounceRefresh)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "restaurant_tables" },
        debounceRefresh,
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "drivers" }, debounceRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, debounceRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, debounceRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "tabs" }, debounceRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "operation_tasks" }, debounceRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "print_jobs" }, debounceRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "internal_notifications" }, () => {
        window.dispatchEvent(new CustomEvent("lfb:notifications-changed"));
        debounceRefresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "store_runtime_status" }, () => {
        window.dispatchEvent(new CustomEvent("lfb:store-status-changed"));
        debounceRefresh();
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inventory_items" },
        debounceRefresh,
      )
      .subscribe();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("lfb:refresh-operation", debounceRefresh);
      if (client && channel) client.removeChannel(channel);
    };
  }, [router]);

  return null;
}
