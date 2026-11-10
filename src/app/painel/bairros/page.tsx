"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, MapPin, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/internal/PageHeader";
import { normalizeDistrictName } from "@/lib/delivery-zones";
import { currency, isDemoMode } from "@/lib/utils";

type Zone = { id: string; name: string; city: string; districts: string[]; fee_cents: number; minimum_order_cents: number; active: boolean };
type Row = { zone: Zone; district: string };

const toCents = (value: string) => Math.max(0, Math.round((Number(value.replace(/[^\d,.-]/g, "").replace(",", ".")) || 0) * 100));
const toReais = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

async function call(url: string, method: string, body?: unknown) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Não foi possível salvar.");
  return data;
}

/**
 * Bairros de entrega: cada bairro com a sua cidade e taxa. Por trás usa as zonas de
 * entrega (bairros com a mesma cidade e taxa ficam juntos na mesma zona).
 */
export default function DistrictsPage() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [query, setQuery] = useState("");
  const [district, setDistrict] = useState("");
  const [city, setCity] = useState("");
  const [fee, setFee] = useState("");
  const [editing, setEditing] = useState<{ key: string; fee: string } | null>(null);

  async function load() {
    if (isDemoMode()) { setLoading(false); return; }
    try {
      const data = await call("/api/settings", "GET");
      const list = (data.deliveryZones || []) as Zone[];
      setZones(list);
      if (!city) setCity(list.find((zone) => zone.active)?.city || "");
    } catch (error) {
      setMessage({ error: true, text: error instanceof Error ? error.message : "Falha ao carregar bairros." });
    } finally { setLoading(false); }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, []);

  const cities = useMemo(() => [...new Set(zones.map((zone) => zone.city))].sort(), [zones]);
  const rows = useMemo(() => {
    const q = normalizeDistrictName(query);
    return zones.flatMap((zone) => zone.districts.map((name) => ({ zone, district: name })))
      .filter((row) => !q || normalizeDistrictName(row.district).includes(q) || normalizeDistrictName(row.zone.city).includes(q))
      .sort((a, b) => a.district.localeCompare(b.district, "pt-BR"));
  }, [zones, query]);

  function exists(name: string, cityName: string) {
    const target = normalizeDistrictName(name);
    return zones.some((zone) => zone.city.toLowerCase() === cityName.toLowerCase() && zone.districts.some((d) => normalizeDistrictName(d) === target));
  }

  /** Coloca o bairro numa zona da mesma cidade e taxa (ou cria uma). */
  async function place(name: string, cityName: string, feeCents: number, minimum = 0) {
    const same = zones.find((zone) => zone.active && zone.city.toLowerCase() === cityName.toLowerCase() && zone.fee_cents === feeCents && zone.minimum_order_cents === minimum);
    if (same) await call(`/api/settings/delivery-zones/${same.id}`, "PATCH", { districts: [...same.districts, name] });
    else await call("/api/settings/delivery-zones", "POST", { name, city: cityName, districts: [name], fee: feeCents, minimumOrder: minimum, active: true });
  }

  async function removeFrom(zone: Zone, name: string) {
    const rest = zone.districts.filter((d) => d !== name);
    if (rest.length) await call(`/api/settings/delivery-zones/${zone.id}`, "PATCH", { districts: rest });
    else await call(`/api/settings/delivery-zones/${zone.id}`, "DELETE");
  }

  async function run(key: string, task: () => Promise<void>, success: string) {
    setWorking(key); setMessage(null);
    try { await task(); setMessage({ error: false, text: success }); await load(); }
    catch (error) { setMessage({ error: true, text: error instanceof Error ? error.message : "Não foi possível salvar." }); }
    finally { setWorking(""); }
  }

  function add(event: React.FormEvent) {
    event.preventDefault();
    const name = district.trim(), cityName = city.trim();
    if (name.length < 2 || cityName.length < 2) { setMessage({ error: true, text: "Informe o bairro e a cidade." }); return; }
    if (exists(name, cityName)) { setMessage({ error: true, text: `${name} já está cadastrado em ${cityName}.` }); return; }
    void run("add", () => place(name, cityName, toCents(fee)), `${name} adicionado. Já aparece no site, no PDV e no robô do WhatsApp.`)
      .then(() => { setDistrict(""); setFee(""); });
  }

  function saveFee(row: Row) {
    if (!editing) return;
    const cents = toCents(editing.fee);
    if (cents === row.zone.fee_cents) { setEditing(null); return; }
    void run(`fee:${row.zone.id}:${row.district}`, async () => {
      // Bairro sozinho na zona: só muda a taxa. Em grupo: sai do grupo e vai para a taxa nova.
      if (row.zone.districts.length === 1) await call(`/api/settings/delivery-zones/${row.zone.id}`, "PATCH", { fee: cents });
      else { await place(row.district, row.zone.city, cents, row.zone.minimum_order_cents); await removeFrom(row.zone, row.district); }
    }, `Taxa de ${row.district} atualizada para ${currency(cents)}.`).then(() => setEditing(null));
  }

  function remove(row: Row) {
    if (!window.confirm(`Remover ${row.district} (${row.zone.city}) da entrega?`)) return;
    void run(`del:${row.zone.id}:${row.district}`, () => removeFrom(row.zone, row.district), `${row.district} removido da entrega.`);
  }

  return <>
    <PageHeader title="Bairros de entrega" icon={MapPin} description="Adicione, pesquise e ajuste a taxa de cada bairro. Vale na hora para o site, o PDV e o robô do WhatsApp."/>
    {message && <p role={message.error ? "alert" : "status"} className={`mb-4 rounded-xl p-3 text-sm font-semibold ${message.error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>{message.text}</p>}

    <form onSubmit={add} className="surface mb-5 grid gap-3 p-4 sm:grid-cols-[1.4fr_1fr_.7fr_auto] sm:items-end">
      <label><span className="label">Bairro</span><input className="input" value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="Ex.: Jardim Encantado"/></label>
      <label><span className="label">Cidade</span><input className="input" list="district-cities" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ex.: Rio Grande da Serra"/><datalist id="district-cities">{cities.map((c) => <option key={c} value={c}/>)}</datalist></label>
      <label><span className="label">Taxa (R$)</span><input className="input" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="0,00"/></label>
      <button type="submit" className="btn-primary" disabled={working === "add"}>{working === "add" ? <Loader2 className="animate-spin" size={17}/> : <Plus size={17}/>}Adicionar bairro</button>
    </form>

    <section className="surface overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <label className="relative w-full sm:max-w-sm"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/35"/><input className="input pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pesquisar bairro ou cidade" aria-label="Pesquisar bairro"/></label>
        <p className="text-sm font-semibold text-black/50">{rows.length} bairro(s)</p>
      </div>
      {loading ? <div className="grid h-40 place-items-center"><Loader2 className="animate-spin"/></div> : !rows.length ? <p className="p-8 text-center text-sm text-black/50">{query ? "Nenhum bairro encontrado." : "Nenhum bairro cadastrado ainda."}</p> :
        <ul className="divide-y">{rows.map((row) => {
          const key = `${row.zone.id}:${row.district}`;
          const isEditing = editing?.key === key;
          return <li key={key} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${row.zone.active ? "" : "opacity-50"}`}>
            <div className="min-w-0 flex-1"><p className="truncate font-bold">{row.district}</p><p className="text-xs text-black/45">{row.zone.city}{row.zone.active ? "" : " • pausado"}</p></div>
            {isEditing ? <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); saveFee(row); }}>
              <input autoFocus className="input w-24" inputMode="decimal" aria-label={`Nova taxa de ${row.district}`} value={editing.fee} onChange={(e) => setEditing({ key, fee: e.target.value })}/>
              <button type="submit" className="btn-primary min-h-10" disabled={!!working}>Salvar</button>
              <button type="button" className="btn-ghost min-h-10" onClick={() => setEditing(null)}>Cancelar</button>
            </form> : <>
              <strong className="text-basso-wine">{row.zone.fee_cents ? currency(row.zone.fee_cents) : "Grátis"}</strong>
              <button type="button" className="btn-ghost min-h-10 px-2" aria-label={`Mudar taxa de ${row.district}`} disabled={!!working} onClick={() => setEditing({ key, fee: toReais(row.zone.fee_cents) })}><Pencil size={16}/></button>
              <button type="button" className="btn-ghost min-h-10 px-2 text-red-700" aria-label={`Remover ${row.district}`} disabled={!!working} onClick={() => remove(row)}>{working === `del:${key}` ? <Loader2 className="animate-spin" size={16}/> : <Trash2 size={16}/>}</button>
            </>}
          </li>;
        })}</ul>}
    </section>
  </>;
}
