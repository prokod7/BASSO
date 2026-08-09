"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  BellRing,
  CheckCheck,
  CircleAlert,
  Loader2,
  Megaphone,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/internal/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { isDemoMode, shortDateTime, uid } from "@/lib/utils";
import type { InternalNotification, NotificationPriority } from "@/types";

const demoHistory: InternalNotification[] = [
  { id: "notification-demo-1", category: "order", priority: "urgent", title: "Pedido #1048 atrasado", body: "O tempo estimado foi ultrapassado em 12 minutos.", href: "/painel/pedidos", createdAt: new Date(Date.now() - 8 * 60_000).toISOString() },
  { id: "notification-demo-2", category: "stock", priority: "high", title: "Estoque baixo", body: "Coca-Cola 2 L chegou ao estoque mínimo.", href: "/painel/estoque", createdAt: new Date(Date.now() - 28 * 60_000).toISOString() },
  { id: "notification-demo-3", category: "approval", priority: "normal", title: "Solicitação aprovada", body: "O ajuste de estoque foi aprovado pelo gestor.", href: "/painel/aprovacoes", readAt: new Date(Date.now() - 45 * 60_000).toISOString(), createdAt: new Date(Date.now() - 80 * 60_000).toISOString() },
];

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<InternalNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [showRead, setShowRead] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", category: "operation", priority: "normal" as NotificationPriority, audienceRole: "counter", href: "" });

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      if (isDemoMode()) {
        setNotifications((current) => current.length ? current : demoHistory);
        return;
      }
      const response = await fetch("/api/notifications?includeRead=true", { cache: "no-store" });
      const body = (await response.json()) as { notifications?: InternalNotification[]; error?: string };
      if (!response.ok) throw new Error(body.error || "Falha ao consultar notificações.");
      setNotifications(body.notifications || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao consultar notificações.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => notifications.filter((notification) => {
    if (!showRead && notification.readAt) return false;
    const haystack = `${notification.title} ${notification.body} ${notification.category}`.toLowerCase();
    return !query.trim() || haystack.includes(query.trim().toLowerCase());
  }), [notifications, query, showRead]);

  async function mark(notification: InternalNotification, action: "read" | "unread" | "dismiss") {
    setWorking(notification.id);
    try {
      if (!isDemoMode()) {
        const response = await fetch(`/api/notifications/${notification.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
        const body = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(body.error || "Falha ao atualizar notificação.");
      }
      if (action === "dismiss") setNotifications((current) => current.filter((item) => item.id !== notification.id));
      else setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, readAt: action === "read" ? new Date().toISOString() : undefined } : item));
      window.dispatchEvent(new CustomEvent("lfb:notifications-refresh"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao atualizar notificação.");
    } finally {
      setWorking(null);
    }
  }

  async function createNotification(event: React.FormEvent) {
    event.preventDefault();
    setWorking("create");
    setMessage("");
    try {
      let notification: InternalNotification;
      if (isDemoMode()) {
        notification = { id: uid("notification"), category: form.category, priority: form.priority, title: form.title.trim(), body: form.body.trim(), href: form.href.trim() || undefined, createdAt: new Date().toISOString() };
      } else {
        const response = await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audienceRole: form.audienceRole || null, category: form.category.trim(), priority: form.priority, title: form.title.trim(), body: form.body.trim(), href: form.href.trim() || null }) });
        const body = (await response.json()) as { notification?: InternalNotification; error?: string };
        if (!response.ok || !body.notification) throw new Error(body.error || "Falha ao criar notificação.");
        notification = body.notification;
      }
      setNotifications((current) => [notification, ...current]);
      setForm({ title: "", body: "", category: "operation", priority: "normal", audienceRole: "counter", href: "" });
      setModal(false);
      setMessage("Notificação interna criada para o perfil selecionado.");
      window.dispatchEvent(new CustomEvent("lfb:notifications-refresh"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao criar notificação.");
    } finally {
      setWorking(null);
    }
  }

  return (
    <>
      <PageHeader title="Central de notificações" icon={BellRing} description="Concentre alertas de pedidos, atrasos, pagamentos, estoque, mesas, delivery, caixa, impressão, aprovações e falhas do sistema." actions={<><button className="btn-secondary" onClick={load}><RefreshCw size={17} />Atualizar</button><button className="btn-primary" onClick={() => setModal(true)}><Plus size={17} />Novo aviso interno</button></>} />
      {message && <p className={`mb-5 rounded-2xl p-4 text-sm font-semibold ${/falha|erro/i.test(message) ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{message}</p>}
      <section className="surface mb-5 grid gap-3 p-4 md:grid-cols-[1fr_auto]"><label className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30" size={17} /><input className="input pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar título, mensagem ou categoria" /></label><button className={`btn-secondary ${showRead ? "border-basso-gold bg-basso-cream" : ""}`} onClick={() => setShowRead((value) => !value)}><CheckCheck size={17} />{showRead ? "Ocultar lidas" : "Mostrar lidas"}</button></section>
      {loading && <div className="surface grid min-h-56 place-items-center"><Loader2 className="animate-spin text-basso-wine" size={34} /></div>}
      {!loading && <div className="space-y-3">{filtered.map((notification) => <article key={notification.id} className={`surface p-4 ${notification.readAt ? "opacity-65" : notification.priority === "urgent" ? "border-red-200" : notification.priority === "high" ? "border-amber-200" : ""}`}><div className="flex flex-col gap-4 sm:flex-row sm:items-start"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${notification.priority === "urgent" ? "bg-red-100 text-red-700" : notification.priority === "high" ? "bg-amber-100 text-amber-800" : "bg-basso-cream text-basso-wine"}`}>{notification.priority === "urgent" ? <CircleAlert size={20} /> : <Bell size={20} />}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-lg font-bold">{notification.title}</h2><span className="rounded-full bg-black/[.04] px-2 py-0.5 text-[9px] font-black uppercase text-black/45">{notification.category}</span>{!notification.readAt && <span className="rounded-full bg-basso-wine px-2 py-0.5 text-[9px] font-black uppercase text-white">Nova</span>}</div><p className="mt-2 text-sm leading-relaxed text-black/55">{notification.body}</p><p className="mt-2 text-[10px] text-black/35">{shortDateTime(notification.createdAt)}</p></div><div className="flex shrink-0 flex-wrap gap-2">{notification.href && <Link className="btn-secondary min-h-9 px-3 text-xs" href={notification.href}>Abrir origem</Link>}<button className="btn-ghost min-h-9 px-3 text-xs" disabled={working === notification.id} onClick={() => mark(notification, notification.readAt ? "unread" : "read")}><CheckCheck size={15} />{notification.readAt ? "Não lida" : "Lida"}</button><button className="btn-ghost min-h-9 px-3 text-xs text-red-600" disabled={working === notification.id} onClick={() => mark(notification, "dismiss")}><Trash2 size={15} />Dispensar</button></div></div></article>)}{!filtered.length && <div className="surface grid min-h-56 place-items-center text-center"><div><CheckCheck className="mx-auto text-emerald-600" size={38} /><p className="mt-3 font-bold">Nenhuma notificação encontrada</p><p className="text-sm text-black/45">Todos os alertas desse filtro foram tratados.</p></div></div>}</div>}
      <Modal open={modal} onClose={() => setModal(false)} title="Novo aviso interno"><form onSubmit={createNotification} className="space-y-4 p-5"><label><span className="label">Título</span><input className="input" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Ex.: Alteração no tempo de preparo" required /></label><label><span className="label">Mensagem</span><textarea className="textarea" value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} placeholder="Informe a equipe sobre a ação necessária" /></label><div className="grid gap-4 sm:grid-cols-2"><label><span className="label">Categoria</span><input className="input" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} /></label><label><span className="label">Prioridade</span><select className="input" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as NotificationPriority })}><option value="urgent">Urgente</option><option value="high">Alta</option><option value="normal">Normal</option><option value="low">Baixa</option></select></label></div><label><span className="label">Perfil destinatário</span><select className="input" value={form.audienceRole} onChange={(event) => setForm({ ...form, audienceRole: event.target.value })}><option value="manager">Gestores</option><option value="counter">Atendentes</option><option value="waiter">Garçons</option><option value="kitchen">Cozinha</option><option value="bar">Bar</option><option value="driver">Motoboys</option><option value="finance">Financeiro</option><option value="viewer">Consulta</option></select></label><label><span className="label">Link interno opcional</span><input className="input" value={form.href} onChange={(event) => setForm({ ...form, href: event.target.value })} placeholder="/painel/pedidos" /></label><div className="flex justify-end gap-2 border-t pt-4"><button type="button" className="btn-secondary" onClick={() => setModal(false)}>Cancelar</button><button type="submit" className="btn-primary" disabled={working === "create"}>{working === "create" ? <Loader2 className="animate-spin" size={17} /> : <Megaphone size={17} />}Publicar aviso</button></div></form></Modal>
    </>
  );
}
