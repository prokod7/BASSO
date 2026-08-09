"use client";

import { Check, Clock3, Loader2, PauseCircle, PlayCircle, Save, Store, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { isDemoMode } from "@/lib/utils";
import type { ExtendedStoreRuntimeStatus, StoreChannel } from "@/types";

const channels: Array<{ id: StoreChannel; label: string }> = [
  { id: "own_delivery", label: "Delivery próprio" },
  { id: "pickup", label: "Retirada" },
  { id: "counter", label: "Balcão" },
  { id: "dine_in", label: "Salão" },
  { id: "table_qr", label: "QR Code nas mesas" },
];

export function StoreControlPanel({ status, onChange, onClose }: { status: ExtendedStoreRuntimeStatus; onChange: (status: ExtendedStoreRuntimeStatus) => void; onClose: () => void }) {
  const [form, setForm] = useState(status);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => setForm(status), [status]);

  function toggleChannel(channel: StoreChannel) {
    setForm((current) => ({ ...current, activeChannels: current.activeChannels.includes(channel) ? current.activeChannels.filter((item) => item !== channel) : [...current.activeChannels, channel] }));
  }

  async function save(nextStatus = form.operationalStatus) {
    if (!form.activeChannels.length) {
      setMessage("Mantenha ao menos um canal operacional ativo.");
      return;
    }
    setWorking(true);
    setMessage("");
    try {
      const payload = { ...form, operationalStatus: nextStatus, acceptingOrders: nextStatus === "open", pauseReason: nextStatus === "paused" ? (form.pauseReason?.trim() || "Operação pausada temporariamente") : null, manualOverride: true, temporaryUntil: form.temporaryUntil || null, publicMessage: form.publicMessage || null };
      let saved: ExtendedStoreRuntimeStatus = { ...payload, pauseReason: payload.pauseReason || undefined, temporaryUntil: payload.temporaryUntil || undefined, publicMessage: payload.publicMessage || undefined, updatedAt: new Date().toISOString() };
      if (!isDemoMode()) {
        const response = await fetch("/api/store-status", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const body = (await response.json()) as ExtendedStoreRuntimeStatus & { error?: string };
        if (!response.ok) throw new Error(body.error || "Falha ao alterar a loja.");
        saved = body;
      }
      setForm(saved);
      onChange(saved);
      setMessage(nextStatus === "open" ? "Loja aberta e parâmetros publicados." : nextStatus === "paused" ? "Novos pedidos foram pausados." : "Loja fechada manualmente.");
      window.dispatchEvent(new CustomEvent("lfb:store-status", { detail: saved }));
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : "Falha ao alterar a loja.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="absolute right-0 top-12 z-50 w-[min(94vw,440px)] overflow-hidden rounded-3xl border border-black/10 bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-black/5 p-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-basso-cream text-basso-wine"><Store size={19} /></span><div><p className="font-display text-lg font-bold">Controle da loja</p><p className="text-xs text-black/45">Canais, prazos e mensagem pública</p></div></div><button className="btn-ghost min-h-9" onClick={onClose}><XCircle size={17} /></button></div>
      <div className="max-h-[72vh] overflow-y-auto p-4">
        <div className="grid grid-cols-3 gap-2">
          <button disabled={working} className={`min-h-11 rounded-xl border text-xs font-black transition ${form.operationalStatus === "open" ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-black/10"}`} onClick={() => save("open")}><PlayCircle size={16} className="mx-auto mb-1" />Abrir</button>
          <button disabled={working} className={`min-h-11 rounded-xl border text-xs font-black transition ${form.operationalStatus === "paused" ? "border-amber-300 bg-amber-50 text-amber-800" : "border-black/10"}`} onClick={() => save("paused")}><PauseCircle size={16} className="mx-auto mb-1" />Pausar</button>
          <button disabled={working} className={`min-h-11 rounded-xl border text-xs font-black transition ${form.operationalStatus === "closed" ? "border-stone-300 bg-stone-100 text-stone-700" : "border-black/10"}`} onClick={() => save("closed")}><XCircle size={16} className="mx-auto mb-1" />Fechar</button>
        </div>
        <label className="mt-4 block"><span className="label">Motivo da pausa ou fechamento</span><input className="input" value={form.pauseReason || ""} onChange={(event) => setForm({ ...form, pauseReason: event.target.value })} placeholder="Ex.: alta demanda na cozinha" /></label>
        <label className="mt-4 block"><span className="label">Mensagem exibida no cardápio</span><textarea className="textarea min-h-20" value={form.publicMessage || ""} onChange={(event) => setForm({ ...form, publicMessage: event.target.value })} placeholder="Mensagem opcional para os clientes" /></label>
        <div className="mt-4 grid gap-3 sm:grid-cols-2"><label><span className="label">Preparo estimado (min)</span><input type="number" min={5} max={240} className="input" value={form.preparationMinutes} onChange={(event) => setForm({ ...form, preparationMinutes: Number(event.target.value) })} /></label><label><span className="label">Entrega estimada (min)</span><input type="number" min={10} max={300} className="input" value={form.deliveryMinutes} onChange={(event) => setForm({ ...form, deliveryMinutes: Number(event.target.value) })} /></label></div>
        <label className="mt-4 block"><span className="label">Retorno automático opcional</span><input type="datetime-local" className="input" value={form.temporaryUntil ? form.temporaryUntil.slice(0, 16) : ""} onChange={(event) => setForm({ ...form, temporaryUntil: event.target.value ? new Date(event.target.value).toISOString() : undefined })} /></label>
        <div className="mt-5"><span className="label">Canais operacionais ativos</span><div className="grid gap-2 sm:grid-cols-2">{channels.map((channel) => { const active = form.activeChannels.includes(channel.id); return <button key={channel.id} type="button" onClick={() => toggleChannel(channel.id)} className={`flex min-h-10 items-center gap-2 rounded-xl border px-3 text-left text-xs font-bold ${active ? "border-basso-gold bg-basso-cream text-basso-wine" : "border-black/10 text-black/45"}`}><span className={`grid h-5 w-5 place-items-center rounded-md ${active ? "bg-basso-wine text-white" : "bg-black/5"}`}>{active && <Check size={13} />}</span>{channel.label}</button>; })}</div></div>
        {form.temporaryUntil && <p className="mt-4 flex items-center gap-2 rounded-xl bg-blue-50 p-3 text-xs font-semibold text-blue-700"><Clock3 size={15} />Retorno programado para {new Date(form.temporaryUntil).toLocaleString("pt-BR")}.</p>}
        {message && <p className={`mt-4 rounded-xl p-3 text-xs font-semibold ${/falha|erro|mantenha/i.test(message) ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{message}</p>}
        <button className="btn-primary mt-5 w-full" disabled={working} onClick={() => save()}>{working ? <Loader2 className="animate-spin" size={17} /> : <Save size={17} />}Salvar parâmetros sem mudar estado</button>
      </div>
    </div>
  );
}
