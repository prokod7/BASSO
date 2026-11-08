"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Power, Save } from "lucide-react";
import { isDemoMode } from "@/lib/utils";

type TableRow = { number: number; capacity: number; status: string; active: boolean };

/** Cadastro de mesas do salão: número, lugares e ativação. */
export function TablesManager() {
  const [tables, setTables] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [migrationApplied, setMigrationApplied] = useState(true);
  const [newNumber, setNewNumber] = useState("");
  const [newCapacity, setNewCapacity] = useState("4");
  const [capacities, setCapacities] = useState<Record<number, string>>({});

  async function load() {
    setLoading(true);
    try {
      if (isDemoMode()) { setTables(Array.from({ length: 15 }, (_, index) => ({ number: index + 1, capacity: index < 10 ? 5 : 2, status: "free", active: true }))); return; }
      const response = await fetch("/api/settings/tables", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Falha ao carregar mesas.");
      setTables(body.tables || []); setMigrationApplied(body.migrationApplied !== false);
      setCapacities(Object.fromEntries((body.tables || []).map((table: TableRow) => [table.number, String(table.capacity)])));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao carregar mesas."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function send(method: "POST" | "PATCH", payload: Record<string, unknown>, key: string, success: string) {
    setBusy(key); setMessage("");
    try {
      if (isDemoMode()) throw new Error("A gestão de mesas exige o banco configurado.");
      const response = await fetch("/api/settings/tables", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Falha ao salvar mesa.");
      setMessage(success); await load(); return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao salvar mesa."); return false; }
    finally { setBusy(""); }
  }

  const active = tables.filter(table => table.active);
  const seats = active.reduce((sum, table) => sum + table.capacity, 0);
  const suggestedNumber = (tables.reduce((max, table) => Math.max(max, table.number), 0) || 0) + 1;

  return (
    <div className="sm:col-span-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><span className="label">Mesas do salão</span><span className="text-xs font-bold text-black/50">{active.length} ativa(s) • {seats} lugares</span></div>
      {!migrationApplied && <p className="mb-2 rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-800">Para cadastrar mais de 15 mesas ou mudar os lugares livremente, aplique a migration 041 no Supabase.</p>}
      {message && <p className="mb-2 rounded-xl bg-blue-50 p-3 text-xs font-semibold text-blue-800">{message}</p>}
      {loading ? <p className="text-sm text-black/45"><Loader2 className="mr-2 inline animate-spin" size={15} />Carregando mesas...</p> : (
        <div className="max-h-72 divide-y overflow-y-auto rounded-2xl border">
          {tables.map(table => (
            <div key={table.number} className={`flex flex-wrap items-center gap-2 px-3 py-2 ${table.active ? "" : "bg-black/[.03] text-black/45"}`}>
              <strong className="w-20 text-sm">Mesa {table.number}</strong>
              <label className="flex items-center gap-1 text-xs"><input aria-label={`Lugares da mesa ${table.number}`} className="input h-9 w-16 px-2 text-center" type="number" min={1} max={50} value={capacities[table.number] ?? String(table.capacity)} onChange={event => setCapacities(current => ({ ...current, [table.number]: event.target.value }))} disabled={!table.active} />lugares</label>
              {Number(capacities[table.number] ?? table.capacity) !== table.capacity && table.active && <button type="button" className="btn-ghost min-h-9 px-2 text-xs" disabled={Boolean(busy)} onClick={() => void send("PATCH", { number: table.number, capacity: Number(capacities[table.number]) }, `cap-${table.number}`, `Mesa ${table.number} atualizada.`)}><Save size={14} />Salvar</button>}
              <span className="ml-auto text-[11px] font-bold">{table.active ? (table.status === "free" ? "Livre" : "Em uso") : "Desativada"}</span>
              <button type="button" className={`btn-ghost min-h-9 px-2 text-xs ${table.active ? "text-red-700" : "text-emerald-700"}`} disabled={Boolean(busy) || (table.active && table.status !== "free")} title={table.active && table.status !== "free" ? "Libere a mesa antes de desativar" : undefined} onClick={() => void send("PATCH", { number: table.number, active: !table.active }, `act-${table.number}`, table.active ? `Mesa ${table.number} desativada. O histórico foi preservado.` : `Mesa ${table.number} reativada.`)}><Power size={14} />{table.active ? "Desativar" : "Reativar"}</button>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label><span className="label">Nº da nova mesa</span><input className="input w-28" type="number" min={1} max={999} placeholder={String(suggestedNumber)} value={newNumber} onChange={event => setNewNumber(event.target.value)} /></label>
        <label><span className="label">Lugares</span><input className="input w-24" type="number" min={1} max={50} value={newCapacity} onChange={event => setNewCapacity(event.target.value)} /></label>
        <button type="button" className="btn-secondary" disabled={Boolean(busy)} onClick={async () => { const number = Number(newNumber || suggestedNumber); if (await send("POST", { number, capacity: Number(newCapacity) }, "new", `Mesa ${number} cadastrada. O QR Code dela é /mesa/${number}.`)) setNewNumber(""); }}>{busy === "new" ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}Adicionar mesa</button>
      </div>
      <p className="mt-2 text-xs text-black/45">Desativar esconde a mesa do salão, do garçom e do QR Code sem apagar comandas antigas. Só é possível desativar mesa livre.</p>
    </div>
  );
}
