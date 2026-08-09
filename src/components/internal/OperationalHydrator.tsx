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

function playNewIfoodOrderAlert() {
  try {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const play = () => {
      [0, 0.18, 0.36].forEach((delay, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = index === 2 ? 880 : 720;
        gain.gain.setValueAtTime(0.0001, context.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.22, context.currentTime + delay + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + delay + 0.12);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(context.currentTime + delay);
        oscillator.stop(context.currentTime + delay + 0.13);
      });
      window.setTimeout(() => void context.close(), 900);
    };
    if (context.state === "suspended") void context.resume().then(play).catch(() => undefined);
    else play();
  } catch {
    // Alguns navegadores bloqueiam áudio antes da primeira interação do usuário.
  }
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

    const onOrderChange = (payload: { eventType?: string; new?: Record<string, unknown> }) => {
      if (payload.eventType === "INSERT" && payload.new?.channel === "ifood") {
        playNewIfoodOrderAlert();
        window.dispatchEvent(new Event("lfb:notifications-refresh"));
      }
      debounceRefresh();
    };

    const client = createClient();
    const channel = client
      ?.channel("operational-ui")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, onOrderChange)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "restaurant_tables" },
        debounceRefresh,
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "drivers" }, debounceRefresh)
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
      if (client && channel) client.removeChannel(channel);
    };
  }, [router]);

  return null;
}
