"use client";

import { useMemo, useState } from "react";
import { MapPin, Search, X } from "lucide-react";
import { normalizeDistrictName } from "@/lib/delivery-zones";
import { currency } from "@/lib/utils";

type District = { name: string; aliases: string[]; fee: number };
type City = { name: string; districts: District[] };

/** Busca de bairro atendido: digita parte do nome (sem acento, abreviado) e escolhe; a cidade vem junto. */
export function DistrictSearch({ cities, city, district, onPick, disabled }: { cities: City[]; city: string; district: string; onPick: (city: string, district: string) => void; disabled?: boolean }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const all = useMemo(() => cities.flatMap((c) => c.districts.map((d) => ({ city: c.name, ...d }))), [cities]);
  const results = useMemo(() => {
    const q = normalizeDistrictName(query);
    const list = q ? all.filter((d) => [d.name, ...d.aliases].some((alias) => normalizeDistrictName(alias).includes(q))) : all;
    return list;
  }, [all, query]);
  const multipleCities = cities.length > 1;

  if (district && !open) {
    return <div className="flex items-center justify-between gap-2 rounded-xl border bg-white px-3 py-2 text-sm">
      <span className="flex min-w-0 items-center gap-2"><MapPin size={16} className="shrink-0 text-basso-wine"/><strong className="truncate">{district}</strong>{multipleCities && <span className="truncate text-black/45">— {city}</span>}</span>
      <button type="button" className="btn-ghost min-h-9 px-2 text-xs" disabled={disabled} onClick={() => { setQuery(""); setOpen(true); }}>Trocar</button>
    </div>;
  }

  return <div className="relative">
    <div className="relative">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/35"/>
      <input className="input pl-9 pr-9" value={query} disabled={disabled} autoFocus={open} placeholder={disabled ? "Carregando bairros..." : "Buscar bairro de entrega"} aria-label="Buscar bairro de entrega"
        onClick={() => setOpen(true)} onFocus={() => setOpen(true)} onChange={(e) => { setQuery(e.target.value); setOpen(true); }}/>
      {open && district && <button type="button" aria-label="Cancelar troca de bairro" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-black/40 hover:bg-black/5" onClick={() => setOpen(false)}><X size={16}/></button>}
    </div>
    {open && !disabled && <div role="listbox" aria-label="Bairros atendidos" className="mt-1 max-h-72 overflow-y-auto overscroll-contain rounded-xl border bg-white shadow-xl">
      {results.length ? results.map((d) => <button type="button" role="option" aria-selected={d.city === city && d.name === district} key={`${d.city}:${d.name}`} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-basso-paper"
        onClick={() => { onPick(d.city, d.name); setQuery(""); setOpen(false); }}>
        <span className="min-w-0"><strong className="block truncate">{d.name}</strong>{multipleCities && <span className="text-xs text-black/45">{d.city}</span>}</span>
        <span className="shrink-0 text-xs font-bold text-basso-wine">{d.fee ? currency(d.fee) : "Grátis"}</span>
      </button>) : <p className="p-3 text-sm text-black/50">Nenhum bairro atendido com esse nome. Cadastre em Bairros de entrega.</p>}
    </div>}
  </div>;
}
