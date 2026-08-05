"use client";
import { useEffect } from "react";
import { demoActions } from "@/lib/demo-store";
import { createClient } from "@/lib/supabase/client";
import { isDemoMode } from "@/lib/utils";
import { flushOfflineOperations } from "@/lib/offline-queue";

export function OperationalHydrator() {
  useEffect(() => {
    if (isDemoMode()) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      try {
        const response = await fetch("/api/operational-snapshot", { cache: "no-store" });
        if (!response.ok) return;
        const snapshot = await response.json();
        if (!cancelled) demoActions.replaceSnapshot(snapshot);
      } catch { /* The operation remains usable with the last synchronized snapshot. */ }
    };
    const debounceRefresh = () => { clearTimeout(timer); timer = setTimeout(refresh, 250); };
    refresh();
    flushOfflineOperations().then(result => { if (result.processed > 0) refresh(); });
    const onOnline = () => flushOfflineOperations().then(result => { if (result.processed > 0) refresh(); });
    window.addEventListener("online", onOnline);
    const client = createClient();
    const channel = client?.channel("operational-ui")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, debounceRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "restaurant_tables" }, debounceRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "drivers" }, debounceRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory_items" }, debounceRefresh)
      .subscribe();
    return () => { cancelled = true; clearTimeout(timer); window.removeEventListener("online", onOnline); if (client && channel) client.removeChannel(channel); };
  }, []);
  return null;
}
