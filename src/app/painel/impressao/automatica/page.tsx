"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, PauseCircle, PlayCircle, Printer, TriangleAlert } from "lucide-react";
import { requestPrint } from "@/components/print/PrintHost";

type Settings = { on: boolean; kitchen: boolean; counter: boolean; copies: number };
type Claimed = { id: string; order_id: string | null; sector: string; is_reprint: boolean; created_at: string; processed_at: string };
type Printed = { at: string; label: string; ok: boolean; error?: string };

const POLL_MS = 5000;
const IDLE_POLL_MS = 12000;
const EMPTY_POLLS_BEFORE_IDLE = 3;
const STORE_KEY = "lfb-print-station";

async function acknowledge(job: Claimed, ok: boolean, error?: string) {
  const response = await fetch("/api/print/browser-done", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId: job.id, claimTime: job.processed_at, ok, error }),
  });
  if (!response.ok) throw new Error("Falha ao registrar o resultado. Confira a fila e o papel antes de reimprimir.");
}

function loadSettings(): Settings {
  const base: Settings = { on: false, kitchen: true, counter: true, copies: 1 };
  let saved: Partial<Settings> = {};
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || "{}"); } catch { /* sem armazenamento */ }
  const params = new URLSearchParams(window.location.search);
  const fromUrl: Partial<Settings> = {};
  if (params.get("setores")) {
    const sectors = params.get("setores")!.split(",");
    fromUrl.kitchen = sectors.includes("kitchen");
    fromUrl.counter = sectors.includes("counter");
  }
  if (params.get("vias")) fromUrl.copies = Math.min(3, Math.max(1, Number(params.get("vias")) || 1));
  // Aberto pelo atalho: já liga sozinho.
  if (params.get("ligar") === "1") fromUrl.on = true;
  return { ...base, ...saved, ...fromUrl };
}

/**
 * Estação de impressão automática (modelo do Restaurante do Adão): enquanto ligada, busca a cada
 * 5 s os pedidos novos do setor, imprime nesta janela e só então marca como impresso.
 */
export default function AutoPrintStation() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [log, setLog] = useState<Printed[]>([]);
  const busy = useRef(false);


  useEffect(() => { setSettings(loadSettings()); }, []);
  useEffect(() => { if (settings) try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch { /* ignore */ } }, [settings]);

  // Tela sempre acesa enquanto a estação estiver ligada.
  useEffect(() => {
    if (!settings?.on || !("wakeLock" in navigator)) return;
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as unknown as { wakeLock: { request: (t: string) => Promise<{ release: () => Promise<void> }> } };
    const take = () => void nav.wakeLock.request("screen").then((l) => { lock = l; }).catch(() => undefined);
    take();
    document.addEventListener("visibilitychange", take);
    return () => { document.removeEventListener("visibilitychange", take); void lock?.release(); };
  }, [settings?.on]);

  const tick = useCallback(async () => {
    if (!settings || busy.current || !navigator.onLine) return;
    const sectors = [...(settings.kitchen ? ["kitchen", "bar"] : []), ...(settings.counter ? ["counter"] : [])];
    if (!sectors.length) return;
    busy.current = true;
    try {
      const response = await fetch("/api/print/browser-claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sectors, protocol: 2 }), cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as { jobs?: Claimed[]; error?: string };
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "Sessão expirada: entre de novo no sistema nesta janela." : body.error || "Falha ao consultar a fila.");
      setError("");
      setStatus(`Aguardando pedidos · conferido às ${new Date().toLocaleTimeString("pt-BR")}`);
      for (const job of body.jobs || []) {
        const label = `${job.sector === "counter" ? "Entrega/balcão" : "Cozinha"}${job.order_id ? "" : " • teste"}${job.is_reprint ? " (reimpressão)" : ""}`;
        try {

          if (job.order_id) await requestPrint({ orderId: job.order_id, types: [job.sector === "counter" ? "entrega" : "cozinha"], copies: job.sector === "kitchen" ? 1 : settings.copies, source: "print_page" });
          else await requestPrint({ test: true, types: [] });
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : "Falha ao imprimir";
          setLog((l) => [{ at: new Date().toLocaleTimeString("pt-BR"), label, ok: false, error: message }, ...l].slice(0, 30));
          await acknowledge(job, false, message);
          continue;
        }
        await acknowledge(job, true);
        setLog((l) => [{ at: new Date().toLocaleTimeString("pt-BR"), label, ok: true }, ...l].slice(0, 30));
      }
      return Array.isArray(body.jobs) && body.jobs.length === 0;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sem conexão com o sistema.");
    } finally {
      busy.current = false;
    }
  }, [settings]);

  useEffect(() => {
    if (!settings?.on) return;
    const controller = new AbortController();
    const { signal } = controller;
    const poll = async () => {
      let emptyPolls = 0;
      while (!signal.aborted) {
        const started = Date.now();
        const empty = await tick();
        emptyPolls = empty ? emptyPolls + 1 : 0;
        const interval = emptyPolls >= EMPTY_POLLS_BEFORE_IDLE ? IDLE_POLL_MS : POLL_MS;
        if (signal.aborted) break;
        await new Promise<void>((resolve) => {
          const finish = () => {
            window.clearTimeout(timer);
            signal.removeEventListener("abort", finish);
            resolve();
          };
          const timer = window.setTimeout(finish, Math.max(0, interval - (Date.now() - started)));
          signal.addEventListener("abort", finish, { once: true });
        });
      }
    };
    if (navigator.locks) {
      const key = [STORE_KEY, settings.kitchen, settings.counter, settings.copies].join(":");
      setStatus("Aguardando a estação de impressão neste navegador…");
      void navigator.locks.request(key, { signal }, poll).catch(() => {
        if (!signal.aborted) void poll();
      });
    } else {
      void poll();
    }
    return () => controller.abort();
  }, [settings, tick]);

  if (!settings) return null;
  const set = (patch: Partial<Settings>) => setSettings((s) => (s ? { ...s, ...patch } : s));

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <section className={`rounded-3xl border p-5 ${error ? "border-red-200 bg-red-50" : settings.on ? "border-emerald-200 bg-emerald-50" : "border-black/10 bg-white"}`}>
        <div className="flex flex-wrap items-center gap-3">
          {error ? <TriangleAlert className="text-red-700" size={30} /> : <Printer className={settings.on ? "text-emerald-700" : "text-black/40"} size={30} />}
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl font-bold">{settings.on ? "Impressão automática ligada" : "Impressão automática desligada"}</h1>
            <p className="text-sm text-black/60">{error || (settings.on ? status || "Conectando…" : "Ligue para imprimir cada pedido novo neste computador.")}</p>
          </div>
          <button className={settings.on ? "btn-secondary" : "btn-primary"} onClick={() => set({ on: !settings.on })}>
            {settings.on ? <><PauseCircle size={17} /> Desligar</> : <><PlayCircle size={17} /> Ligar</>}
          </button>
        </div>
      </section>

      <section className="surface grid gap-4 p-5 sm:grid-cols-2">
        <fieldset>
          <legend className="label">Esta impressora imprime</legend>
          <label className="mt-2 flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm font-semibold"><input type="checkbox" checked={settings.kitchen} onChange={(e) => set({ kitchen: e.target.checked })} /> Via da cozinha (sem valores)</label>
          <label className="mt-2 flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm font-semibold"><input type="checkbox" checked={settings.counter} onChange={(e) => set({ counter: e.target.checked })} /> Via de entrega/balcão (completa)</label>
        </fieldset>
        <div>
          <label className="label" htmlFor="ps-copies">Cópias por via (cozinha sempre 1)</label>
          <select id="ps-copies" className="input mt-2" value={settings.copies} onChange={(e) => set({ copies: Number(e.target.value) })}>
            {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <button className="btn-secondary mt-3 w-full" onClick={() => void requestPrint({ test: true, types: [] })}><Printer size={16} /> Imprimir teste</button>
        </div>
      </section>

      <section className="surface p-5">
        <h2 className="font-bold">Últimos envios à impressora</h2>
        <p className="text-xs text-black/45">O navegador não confirma a saída do papel. Confira a impressora antes de reimprimir.</p>
        {log.length === 0 ? <p className="mt-2 text-sm text-black/45">Nenhum ainda.</p> : (
          <ul className="mt-3 space-y-2 text-sm">
            {log.map((item, index) => <li key={index} className={`flex flex-wrap items-center gap-2 ${item.ok ? "" : "text-red-700"}`}>{item.ok ? <CheckCircle2 size={16} className="text-emerald-600" /> : <TriangleAlert size={16} />}<span className="text-black/45">{item.at}</span> {item.label}{item.error && <small>— {item.error}</small>}</li>)}
          </ul>
        )}
      </section>
    </div>
  );
}
