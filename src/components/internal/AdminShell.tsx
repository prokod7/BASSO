"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  AlertCircle,
  CirclePause,
  CirclePlay,
  LockKeyhole,
  Search,
  BarChart3,
  Bike,
  BookOpen,
  Boxes,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  CloudCog,
  Contact,
  Gift,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  Megaphone,
  Printer,
  Receipt,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Store,
  Table2,
  TicketPercent,
  UserCog,
  Users,
  WifiOff,
  X,
} from "lucide-react";
import { cn, isDemoMode } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import {
  OperationalHydrator,
  type OperationalStatusDetail,
} from "@/components/internal/OperationalHydrator";
import { createClient } from "@/lib/supabase/client";
import { useDemoState } from "@/lib/demo-store";
import type { StoreRuntimeStatus } from "@/types";

const sections: Array<{ label: string; items: Array<[string, string, LucideIcon]> }> = [
  {
    label: "Operação",
    items: [
      ["/painel", "Visão geral", LayoutDashboard],
      ["/painel/pedidos", "Pedidos", ClipboardList],
      ["/painel/pdv", "PDV / Balcão", ShoppingCart],
      ["/painel/salao", "Salão e mesas", Table2],
      ["/painel/garcom", "Aplicativo garçom", Users],
      ["/painel/kds", "Cozinha / KDS", ChefHat],
      ["/painel/delivery", "Delivery", Bike],
      ["/painel/motoboy", "PWA motoboy", Bike],
    ],
  },
  {
    label: "Relacionamento",
    items: [
      ["/painel/clientes", "Clientes e CRM", Contact],
      ["/painel/fidelidade", "Fidelidade interna", Gift],
      ["/painel/cupons", "Cupons", TicketPercent],
      ["/painel/campanhas", "Campanhas", Megaphone],
    ],
  },
  {
    label: "Gestão",
    items: [
      ["/painel/cardapio", "Cardápio", BookOpen],
      ["/painel/estoque", "Estoque restrito", Boxes],
      ["/painel/caixa", "Caixa", Receipt],
      ["/painel/financeiro", "Financeiro", CircleDollarSign],
      ["/painel/relatorios", "Relatórios", BarChart3],
    ],
  },
  {
    label: "Administração",
    items: [
      ["/painel/usuarios", "Usuários e acessos", UserCog],
      ["/painel/integracoes", "Integrações", CloudCog],
      ["/painel/impressao", "Impressão", Printer],
      ["/painel/configuracoes", "Configurações", Settings],
      ["/painel/auditoria", "Auditoria", ShieldCheck],
      ["/painel/continuidade", "Offline e contingência", WifiOff],
    ],
  },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [mobile, setMobile] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const activeOrders = useDemoState((state) => state.orders.filter((order) => !["completed", "cancelled"].includes(order.status)).length);
  const [userName, setUserName] = useState(isDemoMode() ? "Gestor Demo" : "Gestor");
  const [userRole, setUserRole] = useState("Gestor");
  const [storePanel, setStorePanel] = useState(false);
  const [pauseReason, setPauseReason] = useState("");
  const [storeWorking, setStoreWorking] = useState(false);
  const [storeMessage, setStoreMessage] = useState("");
  const [storeStatus, setStoreStatus] = useState<StoreRuntimeStatus>({ operationalStatus: "closed", acceptingOrders: false, manualOverride: false, updatedAt: new Date().toISOString() });
  const [status, setStatus] = useState<OperationalStatusDetail>({
    status: "loading",
    message: "Carregando operação",
  });
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const listener = (event: Event) => {
      const customEvent = event as CustomEvent<OperationalStatusDetail>;
      setStatus(customEvent.detail);
    };
    window.addEventListener("lfb:operational-status", listener);

    if (!isDemoMode()) {
      const client = createClient();
      client?.auth.getUser().then(async ({ data }) => {
        const displayName = data.user?.user_metadata?.display_name;
        if (typeof displayName === "string" && displayName.trim()) setUserName(displayName);
        if (data.user) {
          const { data: profile } = await client.from("profiles").select("display_name,role").eq("id", data.user.id).maybeSingle();
          if (profile?.display_name) setUserName(profile.display_name);
          const roleLabels: Record<string,string> = { manager:"Gestor",counter:"Atendente",waiter:"Garçom",kitchen:"Cozinha",bar:"Bar",driver:"Motoboy",finance:"Financeiro",viewer:"Consulta" };
          if (profile?.role) setUserRole(roleLabels[profile.role] || profile.role);
        }
      });
      fetch("/api/store-status", { cache: "no-store" }).then(async (response) => { const body = await response.json(); if (response.ok) setStoreStatus(body); }).catch(() => undefined);
    }

    return () => window.removeEventListener("lfb:operational-status", listener);
  }, []);

  async function updateStore(next: "open" | "paused" | "closed") {
    setStoreWorking(true);
    setStoreMessage("");
    try {
      const payload = { operationalStatus: next, acceptingOrders: next === "open", pauseReason: next === "paused" ? (pauseReason.trim() || "Operação pausada temporariamente") : null, manualOverride: true };
      if (!isDemoMode()) {
        const response = await fetch("/api/store-status", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Falha ao alterar a loja.");
      }
      setStoreStatus({ ...payload, pauseReason: payload.pauseReason || undefined, updatedAt: new Date().toISOString() });
      setStoreMessage(next === "open" ? "Loja aberta para pedidos." : next === "paused" ? "Pedidos temporariamente pausados." : "Loja fechada manualmente.");
      window.dispatchEvent(new CustomEvent("lfb:store-status", { detail: payload }));
    } catch (error) { setStoreMessage(error instanceof Error ? error.message : "Falha ao alterar a loja."); }
    finally { setStoreWorking(false); }
  }

  async function logout() {
    setLeaving(true);
    try {
      const client = createClient();
      await client?.auth.signOut();
      router.replace("/login");
      router.refresh();
    } finally {
      setLeaving(false);
    }
  }

  const statusClass =
    status.status === "online"
      ? "bg-emerald-50 text-emerald-700"
      : status.status === "error"
        ? "bg-red-50 text-red-700"
        : "bg-amber-50 text-amber-700";

  return (
    <div className="min-h-screen bg-[#f5f2eb]">
      <OperationalHydrator />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-white/10 bg-basso-black text-white transition-all",
          collapsed ? "w-20" : "w-72",
          mobile ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="flex h-20 items-center gap-3 border-b border-white/10 px-4">
          <Image
            src="/assets/brand/logo.png"
            alt="La Forneria Basso"
            width={46}
            height={46}
            className="rounded-full ring-1 ring-basso-gold/40"
          />
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate font-display text-lg font-bold">La Forneria Basso</p>
              <p className="text-[10px] uppercase tracking-[.18em] text-basso-goldLight">
                PedidoPro 3.2
              </p>
            </div>
          )}
          <button
            className="ml-auto p-2 lg:hidden"
            onClick={() => setMobile(false)}
            aria-label="Fechar menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="scrollbar-none flex-1 overflow-y-auto p-3">
          {sections.map((section) => (
            <div key={section.label} className="mb-5">
              {!collapsed && (
                <p className="mb-2 px-3 text-[10px] font-black uppercase tracking-[.18em] text-white/35">
                  {section.label}
                </p>
              )}
              <div className="space-y-1">
                {section.items.map(([href, label, Icon]) => {
                  const active = href === "/painel" ? path === href : path.startsWith(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setMobile(false)}
                      title={label}
                      className={cn(
                        "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition",
                        active
                          ? "bg-basso-wine text-white shadow-lg"
                          : "text-white/60 hover:bg-white/5 hover:text-white",
                        collapsed && "justify-center px-0",
                      )}
                    >
                      <Icon size={19} />
                      {!collapsed && <span>{label}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/10 p-3">
          <Link
            href="/"
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-white/60 hover:bg-white/5 hover:text-white",
              collapsed && "justify-center px-0",
            )}
          >
            <Store size={19} />
            {!collapsed && "Abrir cardápio"}
          </Link>
          <button
            type="button"
            onClick={logout}
            disabled={leaving}
            className={cn(
              "mt-1 flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-white/60 hover:bg-white/5 hover:text-white disabled:opacity-50",
              collapsed && "justify-center px-0",
            )}
          >
            {leaving ? <Loader2 size={19} className="animate-spin" /> : <LogOut size={19} />}
            {!collapsed && "Sair"}
          </button>
          <button
            className="mt-1 hidden min-h-10 w-full items-center justify-center gap-2 rounded-xl text-xs text-white/45 hover:bg-white/5 lg:flex"
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? (
              <ChevronRight size={17} />
            ) : (
              <>
                <ChevronLeft size={17} /> Recolher menu
              </>
            )}
          </button>
        </div>
      </aside>

      {mobile && (
        <button
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobile(false)}
          aria-label="Fechar menu"
        />
      )}

      <div className={cn("transition-all", collapsed ? "lg:pl-20" : "lg:pl-72")}>
        <header className="sticky top-0 z-30 flex h-16 items-center border-b border-black/5 bg-white/90 px-4 backdrop-blur-xl sm:px-6">
          <button className="btn-ghost lg:hidden" onClick={() => setMobile(true)}>
            <Menu size={20} />
          </button>

          <Link href="/painel/pedidos" className="ml-2 hidden min-h-10 items-center gap-2 rounded-xl border border-black/5 bg-black/[.025] px-3 text-xs font-bold text-black/55 transition hover:bg-black/5 md:flex"><Search size={15}/>{activeOrders} pedido(s) ativo(s)</Link>

          <div className="relative ml-auto flex items-center gap-3">
            <button type="button" onClick={() => setStorePanel((value) => !value)} className={`hidden min-h-9 items-center gap-2 rounded-full px-3 text-xs font-black sm:flex ${storeStatus.operationalStatus === "open" ? "bg-emerald-50 text-emerald-700" : storeStatus.operationalStatus === "paused" ? "bg-amber-50 text-amber-800" : "bg-stone-100 text-stone-600"}`}>{storeStatus.operationalStatus === "open" ? <CirclePlay size={14}/> : storeStatus.operationalStatus === "paused" ? <CirclePause size={14}/> : <LockKeyhole size={14}/>}Loja {storeStatus.operationalStatus === "open" ? "aberta" : storeStatus.operationalStatus === "paused" ? "pausada" : "fechada"}</button>
            {storePanel && <div className="absolute right-0 top-12 z-50 w-80 rounded-2xl border border-black/10 bg-white p-4 shadow-2xl"><div className="flex items-center justify-between"><div><p className="font-display text-lg font-bold">Controle da loja</p><p className="text-xs text-black/45">Altera o recebimento de pedidos próprios.</p></div><button className="btn-ghost" onClick={() => setStorePanel(false)}><X size={17}/></button></div><label className="mt-4 block"><span className="label">Motivo da pausa</span><input className="input" value={pauseReason} onChange={(event) => setPauseReason(event.target.value)} placeholder="Ex.: alta demanda"/></label><div className="mt-3 grid grid-cols-3 gap-2"><button className="btn-secondary min-h-9 px-2 text-xs" disabled={storeWorking} onClick={() => updateStore("open")}>Abrir</button><button className="btn-secondary min-h-9 px-2 text-xs" disabled={storeWorking} onClick={() => updateStore("paused")}>Pausar</button><button className="btn-secondary min-h-9 px-2 text-xs" disabled={storeWorking} onClick={() => updateStore("closed")}>Fechar</button></div>{storeMessage && <p className="mt-3 rounded-xl bg-basso-paper p-2 text-xs font-semibold">{storeMessage}</p>}</div>}
            <span
              className={cn(
                "hidden max-w-72 items-center gap-2 truncate rounded-full px-3 py-1 text-xs font-bold sm:flex",
                statusClass,
              )}
              title={status.message}
            >
              {status.status === "loading" ? (
                <Loader2 size={13} className="animate-spin" />
              ) : status.status === "error" ? (
                <AlertCircle size={13} />
              ) : (
                <span>●</span>
              )}
              {status.message || "Sistema operacional"}
            </span>
            <div className="grid h-9 w-9 place-items-center rounded-full bg-basso-wine text-xs font-black text-white">
              {userName
                .split(" ")
                .slice(0, 2)
                .map((part) => part[0])
                .join("")
                .toUpperCase() || "GB"}
            </div>
            <div className="hidden sm:block">
              <p className="text-xs font-bold">{userName}</p>
              <p className="text-[10px] text-black/40">{userRole}</p>
            </div>
          </div>
        </header>

        {status.status === "error" && (
          <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-center text-xs font-semibold text-red-700 sm:px-6">
            {status.message}
          </div>
        )}

        <main className="min-h-[calc(100vh-4rem)] p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
