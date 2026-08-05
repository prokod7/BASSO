"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3, Bike, BookOpen, Boxes, Building2, ChefHat, ChevronLeft, ChevronRight,
  CircleDollarSign, ClipboardList, CloudCog, Contact, CreditCard, FileClock, Gift,
  LayoutDashboard, Menu, Megaphone, PackageSearch, Printer, Receipt, Settings,
  ShieldCheck, ShoppingCart, Store, Table2, TicketPercent, UserCog, Users, WifiOff, X
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { OperationalHydrator } from "@/components/internal/OperationalHydrator";

const sections: Array<{ label: string; items: Array<[string, string, LucideIcon]> }> = [
  { label: "Operação", items: [
    ["/painel", "Visão geral", LayoutDashboard], ["/painel/pedidos", "Pedidos", ClipboardList],
    ["/painel/pdv", "PDV / Balcão", ShoppingCart], ["/painel/salao", "Salão e mesas", Table2],
    ["/painel/garcom", "Aplicativo garçom", Users], ["/painel/kds", "Cozinha / KDS", ChefHat],
    ["/painel/delivery", "Delivery", Bike], ["/painel/motoboy", "PWA motoboy", Bike]
  ]},
  { label: "Relacionamento", items: [
    ["/painel/clientes", "Clientes e CRM", Contact], ["/painel/fidelidade", "Fidelidade interna", Gift],
    ["/painel/cupons", "Cupons", TicketPercent], ["/painel/campanhas", "Campanhas", Megaphone]
  ]},
  { label: "Gestão", items: [
    ["/painel/cardapio", "Cardápio", BookOpen], ["/painel/estoque", "Estoque restrito", Boxes],
    ["/painel/caixa", "Caixa", Receipt], ["/painel/financeiro", "Financeiro", CircleDollarSign],
    ["/painel/relatorios", "Relatórios", BarChart3]
  ]},
  { label: "Administração", items: [
    ["/painel/usuarios", "Usuários e acessos", UserCog], ["/painel/integracoes", "Integrações", CloudCog],
    ["/painel/impressao", "Impressão", Printer], ["/painel/configuracoes", "Configurações", Settings],
    ["/painel/auditoria", "Auditoria", ShieldCheck], ["/painel/continuidade", "Offline e contingência", WifiOff]
  ]}
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [mobile, setMobile] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  return <div className="min-h-screen bg-[#f5f2eb]"><OperationalHydrator/>
    <aside className={cn("fixed inset-y-0 left-0 z-50 flex flex-col border-r border-white/10 bg-basso-black text-white transition-all", collapsed ? "w-20" : "w-72", mobile ? "translate-x-0" : "-translate-x-full lg:translate-x-0")}>
      <div className="flex h-20 items-center gap-3 border-b border-white/10 px-4">
        <Image src="/assets/brand/logo.png" alt="La Forneria Basso" width={46} height={46} className="rounded-full ring-1 ring-basso-gold/40" />
        {!collapsed && <div className="min-w-0"><p className="truncate font-display text-lg font-bold">La Forneria Basso</p><p className="text-[10px] uppercase tracking-[.18em] text-basso-goldLight">PedidoPro 3.1</p></div>}
        <button className="ml-auto p-2 lg:hidden" onClick={() => setMobile(false)} aria-label="Fechar menu"><X size={20}/></button>
      </div>
      <nav className="scrollbar-none flex-1 overflow-y-auto p-3">
        {sections.map(section => <div key={section.label} className="mb-5">
          {!collapsed && <p className="mb-2 px-3 text-[10px] font-black uppercase tracking-[.18em] text-white/35">{section.label}</p>}
          <div className="space-y-1">{section.items.map(([href,label,Icon]) => {
            const active = href === "/painel" ? path === href : path.startsWith(href);
            return <Link key={href} href={href} onClick={() => setMobile(false)} title={label} className={cn("flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition", active ? "bg-basso-wine text-white shadow-lg" : "text-white/60 hover:bg-white/5 hover:text-white", collapsed && "justify-center px-0")}><Icon size={19}/>{!collapsed && <span>{label}</span>}</Link>;
          })}</div>
        </div>)}
      </nav>
      <div className="border-t border-white/10 p-3">
        <Link href="/" className={cn("flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-white/60 hover:bg-white/5 hover:text-white", collapsed && "justify-center px-0")}><Store size={19}/>{!collapsed && "Abrir cardápio"}</Link>
        <button className="mt-1 hidden min-h-10 w-full items-center justify-center gap-2 rounded-xl text-xs text-white/45 hover:bg-white/5 lg:flex" onClick={() => setCollapsed(v => !v)}>{collapsed ? <ChevronRight size={17}/> : <><ChevronLeft size={17}/> Recolher menu</>}</button>
      </div>
    </aside>
    {mobile && <button className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setMobile(false)} aria-label="Fechar menu"/>}
    <div className={cn("transition-all", collapsed ? "lg:pl-20" : "lg:pl-72")}>
      <header className="sticky top-0 z-30 flex h-16 items-center border-b border-black/5 bg-white/90 px-4 backdrop-blur-xl sm:px-6">
        <button className="btn-ghost lg:hidden" onClick={() => setMobile(true)}><Menu size={20}/></button>
        <div className="ml-auto flex items-center gap-3"><span className="hidden rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 sm:inline">● Sistema operacional</span><div className="grid h-9 w-9 place-items-center rounded-full bg-basso-wine text-xs font-black text-white">GB</div><div className="hidden sm:block"><p className="text-xs font-bold">Gestor</p><p className="text-[10px] text-black/40">Acesso administrativo</p></div></div>
      </header>
      <main className="min-h-[calc(100vh-4rem)] p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  </div>;
}
