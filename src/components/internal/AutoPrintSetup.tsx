"use client";

import { useEffect, useState } from "react";
import { Download, ExternalLink, Printer } from "lucide-react";

type Sector = "kitchen" | "counter";

/** Monta o .bat que abre a estação de impressão no Chrome (ou Edge) com impressão silenciosa. */
export function shortcutScript(stationUrl: string) {
  return [
    "@echo off",
    "rem Impressao automatica - La Forneria Basso",
    "rem Abre uma janela separada do Chrome que imprime direto na impressora padrao, sem perguntar.",
    'set "B=%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe"',
    'if not exist "%B%" set "B=%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe"',
    'if not exist "%B%" set "B=%LOCALAPPDATA%\\Google\\Chrome\\Application\\chrome.exe"',
    'if not exist "%B%" set "B=%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe"',
    'if not exist "%B%" set "B=%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe"',
    'if not exist "%B%" (echo Chrome ou Edge nao encontrado. Instale o Google Chrome. & pause & exit /b 1)',
    `start "" "%B%" --user-data-dir="%LOCALAPPDATA%\\BassoImpressao" --kiosk-printing --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --no-first-run --no-default-browser-check --app="${stationUrl}"`,
    "",
  ].join("\r\n");
}

export function stationPath(sectors: Sector[], copies: number) {
  return `/painel/impressao/automatica?setores=${sectors.join(",")}&vias=${copies}&ligar=1`;
}

export function AutoPrintSetup() {
  const [kitchen, setKitchen] = useState(true);
  const [counter, setCounter] = useState(true);
  const [copies, setCopies] = useState(1);
  const [origin, setOrigin] = useState("");
  useEffect(() => { setOrigin(window.location.origin); }, []);

  const sectors = [kitchen && "kitchen", counter && "counter"].filter(Boolean) as Sector[];
  const path = stationPath(sectors, copies);

  function download() {
    const blob = new Blob([shortcutScript(`${origin}${path}`)], { type: "application/octet-stream" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "Impressao automatica Basso.bat";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <section className="surface p-5 md:p-6">
      <h2 className="font-display text-2xl font-bold">Impressão automática</h2>
      <p className="mt-1 text-sm text-black/55">Todo pedido novo (site, WhatsApp, balcão, iFood) sai sozinho na impressora deste computador.</p>

      <ol className="mt-5 space-y-5">
        <li>
          <p className="font-bold">1. O que imprimir</p>
          <div className="mt-2 flex flex-wrap gap-3">
            <label className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm font-semibold"><input type="checkbox" checked={kitchen} onChange={(e) => setKitchen(e.target.checked)} /> Via da cozinha</label>
            <label className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm font-semibold"><input type="checkbox" checked={counter} onChange={(e) => setCounter(e.target.checked)} /> Via de entrega/balcão</label>
            <label className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm font-semibold">Cópias de cada
              <select className="rounded-lg border px-2 py-1" value={copies} onChange={(e) => setCopies(Number(e.target.value))}>
                <option value={1}>1</option><option value={2}>2</option><option value={3}>3</option>
              </select>
            </label>
          </div>
        </li>
        <li>
          <p className="font-bold">2. Impressora</p>
          <p className="mt-1 text-sm text-black/60">No Windows, deixe a impressora térmica como <strong>impressora padrão</strong> (Configurações → Impressoras → sua impressora → Definir como padrão).</p>
        </li>
        <li>
          <p className="font-bold">3. Atalho</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button className="btn-primary" disabled={!sectors.length || !origin} onClick={download}><Download size={17} /> Baixar atalho</button>
            <a className="btn-secondary" href={path} target="_blank" rel="noreferrer"><ExternalLink size={17} /> Abrir sem atalho (pede confirmação a cada impressão)</a>
          </div>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-black/60">
            <li>Mova o arquivo baixado para a Área de Trabalho e dê dois cliques nele.</li>
            <li>Na primeira vez, faça login nessa janela e toque em <strong><Printer size={13} className="inline" /> Imprimir teste</strong>.</li>
            <li>Deixe a janela aberta durante o expediente (pode minimizar).</li>
            <li>Para abrir sozinho ao ligar o computador: aperte <strong>Windows + R</strong>, digite <code>shell:startup</code> e copie o atalho para a pasta que abrir.</li>
          </ul>
          {!sectors.length && <p className="mt-2 text-sm font-semibold text-red-700">Escolha pelo menos uma via.</p>}
        </li>
      </ol>
    </section>
  );
}
