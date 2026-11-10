"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Pause, Play, Printer, TriangleAlert } from "lucide-react";

type Sector = "kitchen" | "counter";
type Claimed = { id: string; order_id: string | null; sector: string; is_reprint: boolean; created_at: string };
type Printed = { at: string; label: string; ok: boolean };

const SECTOR_LABEL: Record<string, string> = { kitchen: "Cozinha", counter: "Entrega/balcão", bar: "Cozinha" };
const POLL_MS = 5000;

function readConfig() {
  const params = new URLSearchParams(window.location.search);
  const sectors = (params.get("setores") || "kitchen,counter").split(",").filter((s): s is Sector => s === "kitchen" || s === "counter");
  const copies = Math.min(3, Math.max(1, Number(params.get("vias")) || 1));
  return { sectors: sectors.length ? sectors : (["kitchen", "counter"] as Sector[]), copies };
}

const TEST_PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:80mm auto;margin:3mm}body{font:14px monospace;text-align:center;max-width:74mm;margin:auto}</style></head><body><h2>LA FORNERIA BASSO</h2><p>TESTE DE IMPRESSÃO</p><p>Impressão automática OK</p><p>${"-".repeat(24)}</p><script>addEventListener('load',()=>setTimeout(()=>print(),200))<\/script></body></html>`;

/** Imprime uma página num iframe escondido; a própria página chama window.print() ao carregar. */
function printInFrame(source: { url?: string; html?: string }) {
  return new Promise<void>((resolve) => {
    const frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:80mm;height:10px;border:0;opacity:0;pointer-events:none";
    if (source.url) frame.src = source.url;
    else frame.srcdoc = source.html || "";
    document.body.appendChild(frame);
    // Com impressão silenciosa o Chrome envia direto para a impressora padrão; aguarda a página montar e imprimir.
    window.setTimeout(() => { frame.remove(); resolve(); }, 8000);
  });
}

export default function AutoPrintStation() {
  const [config, setConfig] = useState<{ sectors: Sector[]; copies: number } | null>(null);
  const [running, setRunning] = useState(true);
  const [error, setError] = useState("");
  const [lastCheck, setLastCheck] = useState<string>("");
  const [log, setLog] = useState<Printed[]>([]);
  const since = useRef(new Date().toISOString());
  const busy = useRef(false);

  useEffect(() => { setConfig(readConfig()); }, []);

  useEffect(() => {
    if (!config || !running) return;
    let stopped = false;
    async function tick() {
      if (busy.current || stopped || !config) return;
      busy.current = true;
      try {
        const response = await fetch("/api/print/browser-claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sectors: config.sectors, since: since.current }),
          cache: "no-store",
        });
        const body = (await response.json()) as { jobs?: Claimed[]; error?: string };
        if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "Sessão expirada: entre de novo no sistema nesta janela." : body.error || "Falha ao consultar a fila.");
        setError("");
        setLastCheck(new Date().toLocaleTimeString("pt-BR"));
        for (const job of body.jobs || []) {
          const tipo = job.sector === "counter" ? "entrega" : "cozinha";
          const label = `${SECTOR_LABEL[job.sector] || job.sector}${job.order_id ? ` • pedido ${job.order_id.slice(0, 8)}` : " • teste"}${job.is_reprint ? " (reimpressão)" : ""}`;
          for (let copy = 0; copy < config.copies; copy++) {
            await printInFrame(job.order_id ? { url: `/imprimir/${encodeURIComponent(job.order_id)}?tipo=${tipo}&auto=1` } : { html: TEST_PAGE });
          }
          setLog((current) => [{ at: new Date().toLocaleTimeString("pt-BR"), label, ok: true }, ...current].slice(0, 30));
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Falha ao consultar a fila.");
      } finally {
        busy.current = false;
      }
    }
    void tick();
    const timer = window.setInterval(() => void tick(), POLL_MS);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [config, running]);

  if (!config) return null;

  return (
    <div className="mx-auto max-w-2xl">
      <section className={`rounded-3xl border p-6 ${error ? "border-red-200 bg-red-50" : running ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
        <div className="flex items-center gap-3">
          {error ? <TriangleAlert className="text-red-700" size={32} /> : <Printer className={running ? "text-emerald-700" : "text-amber-700"} size={32} />}
          <div>
            <h1 className="font-display text-2xl font-bold">{error ? "Impressão automática com problema" : running ? "Impressão automática ligada" : "Impressão automática pausada"}</h1>
            <p className="text-sm text-black/60">
              Imprime: {config.sectors.map((s) => SECTOR_LABEL[s]).join(" + ")} • {config.copies} via{config.copies > 1 ? "s" : ""}
              {lastCheck && !error ? ` • conferido às ${lastCheck}` : ""}
            </p>
          </div>
        </div>
        {error && <p className="mt-3 text-sm font-semibold text-red-800">{error}</p>}
        <p className="mt-4 text-sm text-black/60">Deixe esta janela aberta (pode minimizar). Pedidos novos saem sozinhos na impressora padrão do computador.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => setRunning((value) => !value)}>{running ? <><Pause size={17} /> Pausar</> : <><Play size={17} /> Retomar</>}</button>
          <button className="btn-secondary" onClick={() => void printInFrame({ html: TEST_PAGE })}><Printer size={17} /> Imprimir teste</button>
        </div>
      </section>

      <section className="surface mt-6 p-5">
        <h2 className="font-bold">Últimas impressões desta janela</h2>
        {log.length === 0 ? <p className="mt-2 text-sm text-black/45">Nenhuma ainda. Pedidos feitos depois que esta janela abriu aparecem aqui.</p> : (
          <ul className="mt-3 space-y-2 text-sm">
            {log.map((item, index) => <li key={index} className="flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-600" /><span className="text-black/45">{item.at}</span> {item.label}</li>)}
          </ul>
        )}
      </section>
    </div>
  );
}
