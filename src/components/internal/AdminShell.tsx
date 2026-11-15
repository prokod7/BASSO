"use client";

import { VendraMarcaMenu } from "@/components/shared/Vendra";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle, BarChart3, Bell, BellRing, Bike, MapPin, BookOpen, Boxes, ChefHat, ChevronLeft, ChevronRight,
  CircleDollarSign, CirclePause, CirclePlay, ClipboardCheck, ClipboardList, CloudCog, Contact, Gift,
  HeartPulse, HelpCircle, LayoutDashboard, ListChecks, Loader2, LockKeyhole, LogOut, Menu, Megaphone,
  MessageCircle, MessageCircleMore, PackageCheck, Printer, Receipt, Search, ServerCog, Settings, ShieldCheck,
  ShieldQuestion, ShoppingBasket, ShoppingCart, Store, Table2, TicketPercent, UserCog, Users, Volume2, VolumeX, WifiOff, X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn, isDemoMode } from "@/lib/utils";
import { OperationalHydrator, type OperationalStatusDetail } from "@/components/internal/OperationalHydrator";
import { GlobalSearchDialog } from "@/components/internal/GlobalSearchDialog";
import { WhatsAppHandoffAlert } from "@/components/internal/WhatsAppHandoffAlert";
import { NotificationCenter } from "@/components/internal/NotificationCenter";
import { playNewOrderSound, ringForNewOrders } from "@/lib/order-notification-sound";
import { StoreControlPanel } from "@/components/internal/StoreControlPanel";
import { createClient } from "@/lib/supabase/client";
import { useStableDemoState } from "@/lib/stable-store";
import { roleLabels } from "@/lib/admin-control";
import type { ExtendedStoreRuntimeStatus } from "@/types";

import { SYSTEM_VERSION as APP_VERSION } from "@/lib/app-version";
type RoleKey = "manager" | "counter" | "waiter" | "kitchen" | "bar" | "driver" | "finance" | "viewer";
type NavItem = { href: string; label: string; icon: LucideIcon; roles?: RoleKey[]; badge?: "orders" };
type NavSection = { label: string; items: NavItem[]; highlight?: boolean };

const operationRoles: RoleKey[] = ["manager", "counter", "waiter", "kitchen", "bar", "driver", "finance", "viewer"];
const sections: NavSection[] = [
  { label: "Principal", highlight: true, items: [
    { href: "/painel/pdv", label: "PDV / Balcão", icon: ShoppingCart, roles: ["manager", "counter", "waiter"] },
    { href: "/painel/pedidos", label: "Pedidos", icon: ClipboardList, roles: operationRoles, badge: "orders" },
    { href: "/painel/whatsapp", label: "WhatsApp", icon: MessageCircle, roles: ["manager", "counter", "viewer"] },
    { href: "/painel/cardapio", label: "Cardápio", icon: BookOpen, roles: ["manager", "counter", "viewer"] },
    { href: "/painel/configuracoes", label: "Configurações", icon: Settings, roles: ["manager", "viewer"] },
  ]},
  { label: "Operação", items: [
    { href: "/painel", label: "Centro de comando", icon: LayoutDashboard, roles: operationRoles },
    { href: "/painel/atencao", label: "Precisa de atenção", icon: BellRing, roles: operationRoles },
    { href: "/painel/salao", label: "Salão e mesas", icon: Table2, roles: ["manager", "counter", "waiter", "viewer"] },
    { href: "/painel/garcom", label: "Aplicativo garçom", icon: Users, roles: ["manager", "counter", "waiter"] },
    { href: "/painel/kds", label: "Cozinha / KDS", icon: ChefHat, roles: ["manager", "counter", "kitchen", "bar", "waiter"] },
    { href: "/painel/expedicao", label: "Expedição", icon: PackageCheck, roles: ["manager", "counter", "kitchen", "bar"] },
    { href: "/painel/delivery", label: "Delivery", icon: Bike, roles: ["manager", "counter", "driver", "viewer"] },
    { href: "/painel/bairros", label: "Bairros de entrega", icon: MapPin, roles: ["manager"] },
    { href: "/painel/motoboy", label: "PWA motoboy", icon: Bike, roles: ["manager", "counter", "driver"] },
    { href: "/painel/rotinas", label: "Abertura e fechamento", icon: ListChecks, roles: ["manager", "counter", "finance"] },
  ]},
  { label: "Coordenação", items: [
    { href: "/painel/tarefas", label: "Tarefas da equipe", icon: ClipboardCheck, roles: operationRoles },
    { href: "/painel/aprovacoes", label: "Aprovações", icon: ShieldQuestion, roles: ["manager", "counter", "waiter", "finance"] },
    { href: "/painel/notificacoes", label: "Notificações", icon: Bell, roles: operationRoles },
  ]},
  { label: "Relacionamento", items: [
    { href: "/painel/clientes", label: "Clientes e CRM", icon: Contact, roles: ["manager", "counter", "finance", "viewer"] },
    { href: "/painel/fidelidade", label: "Fidelidade interna", icon: Gift, roles: ["manager", "counter", "finance"] },
    { href: "/painel/cupons", label: "Cupons", icon: TicketPercent, roles: ["manager", "counter", "finance"] },
    { href: "/painel/campanhas", label: "Campanhas", icon: Megaphone, roles: ["manager"] },
    { href: "/painel/comunicacao", label: "Modelos de mensagens", icon: MessageCircleMore, roles: ["manager", "counter", "viewer"] },
  ]},
  { label: "Gestão", items: [
    { href: "/painel/promocoes", label: "Promoções do dia", icon: TicketPercent, roles: ["manager"] },
    { href: "/painel/estoque", label: "Estoque restrito", icon: Boxes, roles: ["manager", "counter", "finance", "viewer"] },
    { href: "/painel/inventario", label: "Inventário rápido", icon: ClipboardCheck, roles: ["manager", "counter", "finance", "viewer"] },
    { href: "/painel/compras", label: "Compras e fornecedores", icon: ShoppingBasket, roles: ["manager", "counter", "finance", "viewer"] },
    { href: "/painel/caixa", label: "Caixa", icon: Receipt, roles: ["manager", "counter", "finance"] },
    { href: "/painel/financeiro", label: "Financeiro", icon: CircleDollarSign, roles: ["manager", "finance", "viewer"] },
    { href: "/painel/relatorios", label: "Relatórios", icon: BarChart3, roles: ["manager", "finance", "viewer"] },
  ]},
  { label: "Administração", items: [
    { href: "/painel/usuarios", label: "Usuários e acessos", icon: UserCog, roles: ["manager"] },
    { href: "/painel/integracoes", label: "Integrações", icon: CloudCog, roles: ["manager", "viewer"] },
    { href: "/painel/impressao", label: "Impressão", icon: Printer, roles: ["manager", "counter", "kitchen", "bar", "viewer"] },
    { href: "/painel/auditoria", label: "Auditoria", icon: ShieldCheck, roles: ["manager", "viewer"] },
    { href: "/painel/diagnostico", label: "Sistema e diagnóstico", icon: HeartPulse, roles: ["manager", "viewer"] },
    { href: "/painel/sistema", label: "Sobre esta instalação", icon: ServerCog, roles: ["manager", "viewer"] },
    { href: "/painel/ajuda", label: "Ajuda rápida", icon: HelpCircle, roles: operationRoles },
    { href: "/painel/continuidade", label: "Offline e contingência", icon: WifiOff, roles: ["manager", "counter", "viewer"] },
  ]},
];

const initialStoreStatus: ExtendedStoreRuntimeStatus = {
  operationalStatus: "closed", acceptingOrders: false, manualOverride: false,
  activeChannels: ["own_delivery", "pickup", "counter", "dine_in", "table_qr"],
  preparationMinutes: 45, deliveryMinutes: 60, updatedAt: new Date().toISOString(),
};

export function AdminShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const store = useStableDemoState((state) => state);
  const activeOrders = useMemo(() => store.orders.filter((order) => !["completed", "cancelled"].includes(order.status)).length, [store.orders]);
  const [mobile, setMobile] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [userName, setUserName] = useState(isDemoMode() ? "Gestor Demo" : "Gestor");
  const [profileReady, setProfileReady] = useState(isDemoMode());
  const [role, setRole] = useState<RoleKey>("manager");
  const [storePanel, setStorePanel] = useState(false);
  const [storeStatus, setStoreStatus] = useState<ExtendedStoreRuntimeStatus>(isDemoMode() ? { ...initialStoreStatus, operationalStatus: "open", acceptingOrders: true } : initialStoreStatus);
  const [status, setStatus] = useState<OperationalStatusDetail>({ status: "loading", message: "Carregando operação" });
  const [leaving, setLeaving] = useState(false);
  // Som de novo pedido ligado por padrão; só desliga se a pessoa desligar neste aparelho.
  const [soundEnabled, setSoundEnabledState] = useState(true);
  const setSoundEnabled = (value: boolean) => { setSoundEnabledState(value); try { localStorage.setItem("lfb-sound", value ? "on" : "off"); } catch { /* sem armazenamento */ } };
  useEffect(() => {
    try { if (localStorage.getItem("lfb-sound") === "off") setSoundEnabledState(false); } catch { /* sem armazenamento */ }
    // O navegador só libera áudio depois do primeiro toque/clique na página: destrava em silêncio.
    const unlock = () => {
      try { const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext; const ctx = new AudioCtx(); void ctx.resume().then(() => ctx.close()); } catch { /* ignore */ }
      window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock); window.addEventListener("keydown", unlock);
    return () => { window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
  }, []);

  // Campainha uma única vez por pedido novo em "Recebido" (registro por aparelho, todas as abas).
  useEffect(() => {
    if (status.status !== "online") return;
    if (ringForNewOrders(store.orders.filter(order => order.status === "received").map(order => order.id)) && soundEnabled) void playNewOrderSound();
  }, [store.orders, status.status, soundEnabled]);

  // Robô do WhatsApp: o painel aberto na loja retoma mensagens paradas (sem agendador externo).
  useEffect(() => {
    if (isDemoMode()) return;
    const kick = () => { void fetch("/api/whatsapp/kick", { method: "POST" }).catch(() => undefined); };
    const timer = window.setInterval(kick, 60000);
    return () => window.clearInterval(timer);
  }, []);

  const visibleSections = useMemo(() => sections.map((section) => ({ ...section, items: section.items.filter((item) => !item.roles || item.roles.includes(role)) })).filter((section) => section.items.length), [role]);
  const openSearch = useCallback(() => setSearchOpen(true), []);

  useEffect(() => {
    const listener = (event: Event) => setStatus((event as CustomEvent<OperationalStatusDetail>).detail);
    const keyHandler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT" || target?.isContentEditable;
      if (!typing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); openSearch(); }
    };
    window.addEventListener("lfb:operational-status", listener);
    window.addEventListener("keydown", keyHandler);

    let presenceTimer: ReturnType<typeof setInterval> | undefined;
    let refreshStoreStatus: (() => void) | undefined;

    if (!isDemoMode()) {
      const client = createClient();
      if (client) {
        void (async () => {
          const authResult = await client.auth.getUser();
          const currentUser = authResult.data.user;
          const metadataName = currentUser?.user_metadata?.display_name;
          if (typeof metadataName === "string" && metadataName.trim()) setUserName(metadataName);
          if (!currentUser) return;
          const { data: profile } = await client.from("profiles").select("display_name,role,must_change_password,last_seen_at").eq("id", currentUser.id).maybeSingle();
          if (profile?.display_name) setUserName(profile.display_name);
          if (profile?.role && profile.role in roleLabels) setRole(profile.role as RoleKey);
          setProfileReady(true);
          if (profile?.must_change_password) router.replace("/trocar-senha");
        })().catch(() => setStatus({ status: "error", message: "Não foi possível carregar o perfil do usuário." }));
      }
      refreshStoreStatus = () => {
        fetch("/api/store-status", { cache: "no-store" }).then(async (response) => {
          const body = await response.json() as ExtendedStoreRuntimeStatus;
          if (response.ok) setStoreStatus(body);
        }).catch(() => undefined);
      };
      refreshStoreStatus();
      window.addEventListener("lfb:store-status-changed", refreshStoreStatus);
      const ping = () => fetch("/api/auth/presence", { method: "POST" }).catch(() => undefined);
      ping();
      presenceTimer = setInterval(ping, 60_000);
    }

    return () => {
      if (presenceTimer) clearInterval(presenceTimer);
      window.removeEventListener("lfb:operational-status", listener);
      window.removeEventListener("keydown", keyHandler);
      if (refreshStoreStatus) window.removeEventListener("lfb:store-status-changed", refreshStoreStatus);
    };
  }, [openSearch, router]);

  async function logout() {
    setLeaving(true);
    try {
      const client = createClient();
      await client?.auth.signOut();
      router.replace("/login");
      router.refresh();
    } finally { setLeaving(false); }
  }

  const statusClass = status.status === "online" ? "bg-emerald-50 text-emerald-700" : status.status === "error" ? "bg-red-50 text-red-700" : status.status === "offline" ? "bg-amber-50 text-amber-800" : "bg-blue-50 text-blue-700";
  const storeLabel = storeStatus.operationalStatus === "open" ? "aberta" : storeStatus.operationalStatus === "paused" ? "pausada" : "fechada";

  return <div className="min-h-dvh bg-[#f5f2eb]">
    <OperationalHydrator />
    <GlobalSearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />

    <aside className={cn("fixed inset-y-0 left-0 z-50 flex flex-col border-r border-white/10 bg-basso-black text-white transition-all", collapsed ? "w-20" : "w-72", mobile ? "translate-x-0" : "-translate-x-full lg:translate-x-0")}>
      <div className="flex min-h-20 items-center gap-3 border-b border-white/10 px-4 pt-[env(safe-area-inset-top)]">
        <Image src="/assets/brand/logo.png" alt="La Forneria Basso" width={46} height={46} className="rounded-full ring-1 ring-basso-gold/40" />
        {!collapsed && <div className="min-w-0"><p className="truncate font-display text-lg font-bold">La Forneria Basso</p><p className="text-[10px] uppercase tracking-[.18em] text-basso-goldLight">PedidoPro {APP_VERSION}</p></div>}
        <button className="ml-auto p-2 lg:hidden" onClick={() => setMobile(false)} aria-label="Fechar menu"><X size={20} /></button>
      </div>

      <nav className="scrollbar-none flex-1 overflow-y-auto p-3">
        {visibleSections.map((section) => <div key={section.label} className={cn("mb-5", section.highlight && "rounded-2xl border border-basso-gold/40 bg-basso-gold/10 p-1.5")}>
          {!collapsed && <p className={cn("mb-2 px-3 text-[10px] font-black uppercase tracking-[.18em]", section.highlight ? "pt-1 text-basso-goldLight" : "text-white/35")}>{section.label}</p>}
          <div className="space-y-1">{section.items.map((item) => {
            const active = item.href === "/painel" ? path === item.href : path.startsWith(item.href);
            const Icon = item.icon;
            return <Link key={item.href} href={item.href} onClick={() => setMobile(false)} title={item.label} className={cn("flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition", section.highlight && "min-h-12 text-[15px] font-bold", active ? "bg-basso-wine text-white shadow-lg" : section.highlight ? "text-white hover:bg-white/10" : "text-white/60 hover:bg-white/5 hover:text-white", collapsed && "justify-center px-0")}><Icon size={19} />{!collapsed && <><span className="min-w-0 flex-1 truncate">{item.label}</span>{item.badge === "orders" && activeOrders > 0 && <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-black">{activeOrders}</span>}</>}</Link>;
          })}</div>
        </div>)}
      </nav>

      <div className="border-t border-white/10 p-3 pb-[calc(.75rem+env(safe-area-inset-bottom))]">
        <Link href="/" className={cn("flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-white/60 hover:bg-white/5 hover:text-white", collapsed && "justify-center px-0")}><Store size={19} />{!collapsed && "Abrir cardápio"}</Link>
        <button type="button" onClick={logout} disabled={leaving} className={cn("mt-1 flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-white/60 hover:bg-white/5 hover:text-white disabled:opacity-50", collapsed && "justify-center px-0")}>{leaving ? <Loader2 size={19} className="animate-spin" /> : <LogOut size={19} />}{!collapsed && "Sair"}</button>
        <button className="mt-1 hidden min-h-10 w-full items-center justify-center gap-2 rounded-xl text-xs text-white/45 hover:bg-white/5 lg:flex" onClick={() => setCollapsed((value) => !value)}>{collapsed ? <ChevronRight size={17} /> : <><ChevronLeft size={17} /> Recolher menu</>}</button>
        <div className="mt-3 pb-1"><VendraMarcaMenu recolhido={collapsed} /></div>
      </div>
    </aside>

    {mobile && <button className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setMobile(false)} aria-label="Fechar menu" />}

    <div className={cn("transition-all", collapsed ? "lg:pl-20" : "lg:pl-72")}>
      <header className="sticky top-0 z-30 flex min-h-16 items-center border-b border-black/5 bg-white/90 px-3 pt-[env(safe-area-inset-top)] backdrop-blur-xl sm:px-6">
        <button className="grid h-11 w-11 place-items-center rounded-xl lg:hidden" onClick={() => setMobile(true)} aria-label="Abrir menu"><Menu size={22} /></button>
        <button onClick={openSearch} className="ml-1 flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-black/5 bg-black/[.025] px-3 text-left text-xs font-semibold text-black/45 transition hover:bg-black/5 sm:ml-2 sm:max-w-md"><Search size={17} /><span className="truncate">Buscar em toda a operação...</span><span className="ml-auto hidden rounded-md border border-black/10 px-1.5 py-0.5 text-[9px] font-black text-black/30 sm:block">Ctrl K</span></button>
        <div className="relative ml-auto flex items-center gap-2 sm:gap-3">
          <button type="button" onClick={() => setStorePanel((value) => !value)} className={`hidden min-h-9 items-center gap-2 rounded-full px-3 text-xs font-black sm:flex ${storeStatus.operationalStatus === "open" ? "bg-emerald-50 text-emerald-700" : storeStatus.operationalStatus === "paused" ? "bg-amber-50 text-amber-800" : "bg-stone-100 text-stone-600"}`}>{storeStatus.operationalStatus === "open" ? <CirclePlay size={14} /> : storeStatus.operationalStatus === "paused" ? <CirclePause size={14} /> : <LockKeyhole size={14} />}Loja {storeLabel}</button>
          {storePanel && <StoreControlPanel status={storeStatus} onChange={setStoreStatus} onClose={() => setStorePanel(false)} />}
          <button type="button" className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border transition ${soundEnabled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-black/10 bg-white text-black/50"}`} title={soundEnabled ? "Desativar som de novos pedidos" : "Ativar som de novos pedidos"} aria-label={soundEnabled ? "Desativar som de novos pedidos" : "Ativar som de novos pedidos"} aria-pressed={soundEnabled} onClick={() => { const next = !soundEnabled; setSoundEnabled(next); if (next) void playNewOrderSound(); }}>{soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}</button>
          <NotificationCenter />
          <span className={cn("hidden max-w-56 items-center gap-2 truncate rounded-full px-3 py-1 text-xs font-bold xl:flex", statusClass)} title={status.message}>{status.status === "loading" ? <Loader2 size={13} className="animate-spin" /> : status.status === "error" || status.status === "offline" ? <AlertCircle size={13} /> : <span>●</span>}{status.message || "Sistema operacional"}</span>
          <div className="grid h-10 w-10 place-items-center rounded-full bg-basso-wine text-xs font-black text-white">{userName.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "GB"}</div>
          <div className="hidden sm:block"><p className="max-w-28 truncate text-xs font-bold">{userName}</p><p className="text-[10px] text-black/40">{roleLabels[role] || role}</p></div>
        </div>
      </header>

      <WhatsAppHandoffAlert enabled={profileReady && !isDemoMode() && (role === "manager" || role === "counter")} />
      {(status.status === "error" || status.status === "offline") && <div className={`border-b px-4 py-2 text-center text-xs font-semibold sm:px-6 ${status.status === "offline" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-red-200 bg-red-50 text-red-700"}`}>{status.message}</div>}
      <main className="min-h-[calc(100dvh-4rem)] p-3 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-6 lg:p-8">{children}</main>
    </div>
  </div>;
}
