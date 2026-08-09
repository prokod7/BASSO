"use client";

import Link from "next/link";
import { Bell, BellRing, CheckCheck, CircleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { isDemoMode, shortDateTime } from "@/lib/utils";
import type { InternalNotification } from "@/types";

const demoNotifications: InternalNotification[] = [
  { id: "demo-notification-1", category: "order", priority: "urgent", title: "Pedido #1048 atrasado", body: "O tempo estimado foi ultrapassado em 12 minutos.", href: "/painel/pedidos", createdAt: new Date(Date.now() - 6 * 60_000).toISOString() },
  { id: "demo-notification-2", category: "stock", priority: "high", title: "Estoque baixo", body: "Coca-Cola 2 L chegou ao estoque mínimo.", href: "/painel/estoque", createdAt: new Date(Date.now() - 22 * 60_000).toISOString() },
  { id: "demo-notification-3", category: "approval", priority: "normal", title: "Aprovação pendente", body: "Há uma solicitação de desconto aguardando o gestor.", href: "/painel/aprovacoes", createdAt: new Date(Date.now() - 38 * 60_000).toISOString() },
];

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<InternalNotification[]>([]);
  const [error, setError] = useState("");

  async function load() {
    if (isDemoMode()) {
      setNotifications(demoNotifications);
      return;
    }
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      const body = (await response.json()) as { notifications?: InternalNotification[]; error?: string };
      if (!response.ok) throw new Error(body.error || "Falha ao consultar notificações.");
      setNotifications(body.notifications || []);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao consultar notificações.");
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 45_000);
    const listener = () => load();
    window.addEventListener("lfb:notifications-refresh", listener);
    window.addEventListener("lfb:notifications-changed", listener);
    return () => {
      clearInterval(timer);
      window.removeEventListener("lfb:notifications-refresh", listener);
      window.removeEventListener("lfb:notifications-changed", listener);
    };
  }, []);

  async function mark(notification: InternalNotification, action: "read" | "dismiss") {
    if (!isDemoMode()) {
      const response = await fetch(`/api/notifications/${notification.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      if (!response.ok) return;
    }
    setNotifications((current) => current.filter((item) => item.id !== notification.id));
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen((value) => !value)} className="relative grid h-9 w-9 place-items-center rounded-full border border-black/5 bg-white text-black/55 transition hover:bg-black/[.03]" aria-label="Notificações">
        {notifications.length ? <BellRing size={18} className="text-basso-wine" /> : <Bell size={18} />}
        {notifications.length > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-basso-wine px-1 text-[9px] font-black text-white">{notifications.length > 9 ? "9+" : notifications.length}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-[min(92vw,390px)] overflow-hidden rounded-3xl border border-black/10 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-black/5 p-4"><div><p className="font-display text-lg font-bold">Central de notificações</p><p className="text-xs text-black/45">{notifications.length} alerta(s) não lido(s)</p></div><button className="btn-ghost min-h-9" onClick={() => setOpen(false)}><X size={17} /></button></div>
          <div className="max-h-[55vh] overflow-y-auto p-2">
            {error && <p className="m-2 rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-800">{error}</p>}
            {notifications.map((notification) => (
              <article key={notification.id} className={`mb-2 rounded-2xl border p-3 ${notification.priority === "urgent" ? "border-red-200 bg-red-50" : notification.priority === "high" ? "border-amber-200 bg-amber-50" : "border-black/5 bg-basso-paper/60"}`}>
                <div className="flex gap-3"><CircleAlert size={18} className={notification.priority === "urgent" ? "text-red-600" : notification.priority === "high" ? "text-amber-700" : "text-basso-wine"} /><div className="min-w-0 flex-1"><p className="text-sm font-bold">{notification.title}</p><p className="mt-1 text-xs leading-relaxed text-black/55">{notification.body}</p><p className="mt-2 text-[10px] text-black/35">{shortDateTime(notification.createdAt)}</p></div></div>
                <div className="mt-3 flex gap-2">{notification.href && <Link href={notification.href} onClick={() => { mark(notification, "read"); setOpen(false); }} className="btn-secondary min-h-8 flex-1 px-2 text-xs">Abrir</Link>}<button className="btn-ghost min-h-8 px-2 text-xs" onClick={() => mark(notification, "read")}><CheckCheck size={14} />Lida</button></div>
              </article>
            ))}
            {!notifications.length && <div className="grid min-h-48 place-items-center text-center"><div><CheckCheck className="mx-auto text-emerald-600" size={34} /><p className="mt-3 font-bold">Tudo sob controle</p><p className="text-xs text-black/45">Nenhum alerta operacional não lido.</p></div></div>}
          </div>
          <Link href="/painel/notificacoes" onClick={() => setOpen(false)} className="flex min-h-11 items-center justify-center border-t border-black/5 text-xs font-bold text-basso-wine">Ver histórico completo</Link>
        </div>
      )}
    </div>
  );
}
