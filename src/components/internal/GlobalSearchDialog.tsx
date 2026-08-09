"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bike,
  CircleDollarSign,
  ClipboardCheck,
  PackageSearch,
  ReceiptText,
  Search,
  Table2,
  UserRound,
  X,
} from "lucide-react";
import { demoSearch } from "@/lib/admin-control";
import { isDemoMode } from "@/lib/utils";
import type { GlobalSearchResult } from "@/types";

const icons = {
  order: ReceiptText,
  customer: UserRound,
  table: Table2,
  product: PackageSearch,
  driver: Bike,
  task: ClipboardCheck,
  financial: CircleDollarSign,
} as const;

export function GlobalSearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 30);
    const keyHandler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", keyHandler);
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", keyHandler);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([]);
      setError("");
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        if (isDemoMode()) {
          setResults(demoSearch(query));
          return;
        }
        const response = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`, { cache: "no-store" });
        const body = (await response.json()) as { results?: GlobalSearchResult[]; error?: string };
        if (!response.ok) throw new Error(body.error || "Falha na busca.");
        setResults(body.results || []);
      } catch (searchError) {
        setError(searchError instanceof Error ? searchError.message : "Falha na busca.");
      } finally {
        setLoading(false);
      }
    }, 240);
    return () => clearTimeout(timer);
  }, [open, query]);

  const groups = useMemo(() => {
    const map = new Map<GlobalSearchResult["kind"], GlobalSearchResult[]>();
    for (const result of results) {
      const list = map.get(result.kind) || [];
      list.push(result);
      map.set(result.kind, list);
    }
    return [...map.entries()];
  }, [results]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] bg-black/60 p-3 backdrop-blur-sm sm:p-8" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="mx-auto mt-[8vh] max-w-3xl overflow-hidden rounded-3xl border border-white/10 bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-black/5 px-4 py-3 sm:px-5">
          <Search className="text-basso-wine" size={22} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-12 min-w-0 flex-1 border-0 bg-transparent text-base font-semibold outline-none placeholder:font-normal placeholder:text-black/35"
            placeholder="Buscar pedido, cliente, telefone, mesa, produto, motoboy ou lançamento..."
          />
          <span className="hidden rounded-lg border border-black/10 px-2 py-1 text-[10px] font-bold text-black/35 sm:block">ESC</span>
          <button className="btn-ghost min-h-9" onClick={onClose} aria-label="Fechar busca"><X size={19} /></button>
        </div>
        <div className="max-h-[62vh] overflow-y-auto bg-basso-paper/60 p-3 sm:p-4">
          {query.trim().length < 2 && (
            <div className="grid min-h-52 place-items-center text-center">
              <div><Search className="mx-auto text-black/20" size={42} /><p className="mt-3 font-bold">Busca global do sistema</p><p className="mt-1 text-sm text-black/45">Digite ao menos dois caracteres. Você também pode buscar pelo número do pedido.</p></div>
            </div>
          )}
          {loading && <p className="p-8 text-center text-sm font-semibold text-black/45">Buscando em toda a operação...</p>}
          {error && <p className="rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</p>}
          {!loading && query.trim().length >= 2 && !error && results.length === 0 && (
            <div className="grid min-h-44 place-items-center text-center"><div><PackageSearch className="mx-auto text-black/20" size={38} /><p className="mt-3 font-bold">Nenhum resultado encontrado</p><p className="mt-1 text-sm text-black/45">Tente telefone sem pontuação, número do pedido ou parte do nome.</p></div></div>
          )}
          <div className="space-y-4">
            {groups.map(([kind, entries]) => (
              <section key={kind}>
                <p className="mb-2 px-2 text-[10px] font-black uppercase tracking-[.16em] text-black/35">{kind}</p>
                <div className="space-y-2">
                  {entries.map((result) => {
                    const Icon = icons[result.kind];
                    return (
                      <Link key={`${result.kind}-${result.id}`} href={result.href} onClick={onClose} className="flex items-center gap-3 rounded-2xl border border-black/5 bg-white p-3 transition hover:border-basso-gold/50 hover:shadow-sm">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-basso-cream text-basso-wine"><Icon size={19} /></span>
                        <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{result.title}</p><p className="truncate text-xs text-black/45">{result.subtitle}</p></div>
                        {result.badge && <span className="hidden rounded-full bg-black/[.04] px-2 py-1 text-[10px] font-bold text-black/50 sm:block">{result.badge}</span>}
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-black/5 px-4 py-3 text-[10px] text-black/35"><span>Enter abre o item selecionado no fluxo completo.</span><span>PedidoPro • busca operacional</span></div>
      </div>
    </div>
  );
}
