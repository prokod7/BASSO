#!/usr/bin/env node
import net from "node:net";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const bridgeDir = path.dirname(fileURLToPath(import.meta.url));
const configPath = process.argv[2] || process.env.PRINT_BRIDGE_CONFIG || path.join(bridgeDir, "config.json");
const config = JSON.parse(await fs.readFile(configPath, "utf8"));
if (!config.baseUrl || !config.apiKey) throw new Error("baseUrl e apiKey são obrigatórios no config.json.");
const intervalMs = Math.max(1500, Number(config.pollIntervalMs || 3000));
let stopped = false;
let lastHeartbeatAt = 0;
process.on("SIGINT", () => { stopped = true; });
process.on("SIGTERM", () => { stopped = true; });

const center = text => {
  const width = Number(config.paperColumns || 42);
  const value = String(text || "").slice(0, width);
  return `${" ".repeat(Math.max(0, Math.floor((width - value.length) / 2)))}${value}`;
};
const line = () => "-".repeat(Number(config.paperColumns || 42));
const money = cents => `R$ ${(Number(cents || 0) / 100).toFixed(2).replace(".", ",")}`;
const normalize = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E\n]/g, "?");

function addressLines(address) {
  if (!address || typeof address !== "object") return [];
  const first = [address.street, address.number].filter(Boolean).join(", ");
  const second = [address.district, address.city, address.state].filter(Boolean).join(" - ");
  const third = [address.complement ? `Comp: ${address.complement}` : "", address.reference ? `Ref: ${address.reference}` : ""].filter(Boolean).join(" | ");
  return [first, second, address.cep ? `CEP: ${address.cep}` : "", third].filter(Boolean);
}

function render(job) {
  const payload = job.payload || {};
  const order = payload.order || {};
  const items = payload.items || [];
  const lines = [
    center("LA FORNERIA BASSO"),
    center(`${String(job.sector || "").toUpperCase()} ${payload.event === "item_added" ? "- ACRESCIMO DE ITENS" : job.is_reprint ? "- REIMPRESSAO" : ""}`),
    line(),
    `PEDIDO #${order.daily_number || order.number || order.id || job.order_id || ""}`,
    `CANAL: ${order.channel || ""}`,
    `CLIENTE: ${order.customer_name || ""}`,
    order.customer_phone ? `TEL: ${order.customer_phone}` : "",
    order.table_number ? `MESA: ${order.table_number}` : "",
    line()
  ];

  for (const item of items) {
    lines.push(`${item.quantity || 1}x ${item.display_name || item.name_snapshot || item.name || "Item"}`);
    if (item.unit_price_cents != null) lines.push(`   ${money(item.unit_price_cents)}`);
    if (Array.isArray(item.detail_lines)) {
      lines.push(...item.detail_lines.map(detail => `   ${detail.text}`), "");
      continue;
    }
    const selection = item.selection || {};
    if (selection.size) lines.push(`   ${selection.size} | massa ${selection.mass || "tradicional"}`);
    if (selection.flavorA) lines.push(`   Sabor: ${selection.flavorA}${selection.flavorB ? ` / ${selection.flavorB}` : ""}`);
    if (selection.removedA?.length) lines.push(`   SEM: ${selection.removedA.join(", ")}`);
    if (selection.removedB?.length) lines.push(`   SEM 2a METADE: ${selection.removedB.join(", ")}`);
    if (selection.addons && Object.keys(selection.addons).length) lines.push(`   ADICIONAIS: ${Object.entries(selection.addons).filter(([, q]) => Number(q) > 0).map(([id, q]) => { const place=selection.addonPlacements?.[id]||"whole"; const label=place==="halfA"?`METADE ${selection.flavorA||"1"}`:place==="halfB"?`METADE ${selection.flavorB||"2"}`:"INTEIRA"; return `${q}x ${id} (${label})`; }).join(", ")}`);
    if(selection.secondGrandeFlavor) lines.push(`   Grande 2: ${selection.secondGrandeFlavor}${selection.secondGrandeFlavorB?` / ${selection.secondGrandeFlavorB}`:""}`);
    if(selection.sweetFlavor) lines.push(`   ${selection.sweetSize === "grande"?"Grande":"Broto"} doce: ${selection.sweetFlavor}`);
    if(selection.beverage) lines.push(`   Bebida: ${selection.beverage}`);
    if (selection.notes) lines.push(`   OBS: ${selection.notes}`);
    lines.push("");
  }

  if (job.sector === "counter") {
    lines.push(line());
    if (order.subtotal_cents != null) lines.push(`SUBTOTAL: ${money(order.subtotal_cents)}`);
    if (Number(order.discount_cents || 0) > 0) lines.push(`DESCONTO: -${money(order.discount_cents)}`);
    if (Number(order.delivery_fee_cents || 0) > 0) lines.push(`ENTREGA: ${money(order.delivery_fee_cents)}`);
    if (order.total_cents != null) lines.push(`TOTAL: ${money(order.total_cents)}`);
    if (order.payment_method) lines.push(`PAGAMENTO: ${String(order.payment_method).toUpperCase()}`);
    if (order.change_for_cents) lines.push(`TROCO PARA: ${money(order.change_for_cents)}`);
    const deliveryAddress = addressLines(order.address);
    if (deliveryAddress.length) lines.push(line(), "ENDERECO:", ...deliveryAddress);
  }

  if (order.notes) lines.push(line(), `OBS PEDIDO: ${order.notes}`);
  lines.push(line(), new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }), "", "", "");
  const text = normalize(lines.filter(Boolean).join("\n"));
  return Buffer.concat([Buffer.from([0x1b, 0x40]), Buffer.from(text, "ascii"), Buffer.from([0x0a, 0x0a, 0x1d, 0x56, 0x01])]);
}

async function sendTcp(printer, bytes) {
  await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: printer.host, port: Number(printer.port || 9100) });
    const timeout = setTimeout(() => socket.destroy(new Error("Tempo esgotado ao conectar na impressora.")), Number(printer.timeoutMs || 8000));
    socket.on("connect", () => socket.end(bytes));
    socket.on("close", hadError => { clearTimeout(timeout); if (!hadError) resolve(); });
    socket.on("error", error => { clearTimeout(timeout); reject(error); });
  });
}

async function sendFile(printer, bytes) {
  const directory = printer.directory || path.join(bridgeDir, "spool");
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, `${Date.now()}-${printer.key || "printer"}.bin`), bytes);
}

async function sendSystem(printer, bytes) {
  const tmp = path.join(os.tmpdir(), `pedidopro-${Date.now()}.bin`);
  await fs.writeFile(tmp, bytes);
  try {
    if (process.platform === "win32") {
      if (!/^[\w .()_\-À-ÿ]+$/u.test(printer.name || "")) throw new Error("Nome de impressora inválido.");
      const script = path.join(bridgeDir, "raw-print.ps1");
      await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script, "-PrinterName", printer.name, "-FilePath", tmp]);
    } else {
      await run("lp", printer.name ? ["-d", printer.name, "-o", "raw", tmp] : ["-o", "raw", tmp]);
    }
  } finally { await fs.unlink(tmp).catch(() => undefined); }
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", shell: false });
    child.on("error", reject);
    child.on("exit", code => code === 0 ? resolve() : reject(new Error(`${command} finalizou com código ${code}`)));
  });
}

async function print(job) {
  const printer = config.printers?.[job.printer_key] || config.printers?.[job.sector];
  if (!printer) throw new Error(`Impressora não configurada: ${job.printer_key || job.sector}`);
  const bytes = render(job);
  if (printer.type === "tcp") return sendTcp(printer, bytes);
  if (printer.type === "file") return sendFile(printer, bytes);
  if (printer.type === "system") return sendSystem(printer, bytes);
  throw new Error(`Tipo de impressora inválido: ${printer.type}`);
}

async function request(endpoint, body) {
  const response = await fetch(new URL(endpoint, config.baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Print-Bridge-Key": config.apiKey },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

async function heartbeat() {
  const now = Date.now();
  if (now - lastHeartbeatAt < 20_000) return;
  await request("/api/print/heartbeat", { bridge: "PedidoPro Print Bridge", hostname: os.hostname(), platform: process.platform, version: "1.2", printers: Object.keys(config.printers || {}) });
  lastHeartbeatAt = now;
}

async function cycle() {
  await heartbeat();
  const { jobs = [] } = await request("/api/print/claim", { printers: Object.keys(config.printers || {}) });
  for (const job of jobs) {
    let errorMessage;
    try {
      await print(job);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }
    await request("/api/print/complete", {
      jobId: job.id, claimTime: job.claimed_at, success: errorMessage === undefined, error: errorMessage,
    });
    if (errorMessage !== undefined) console.error(`[ERRO] ${job.id}: ${errorMessage}`);
    else console.log(`[ENVIADO] ${job.id} -> ${job.printer_key}`);
  }
}

console.log(`PedidoPro Print Bridge v1.2 ativo: ${config.baseUrl}`);
while (!stopped) {
  try { await cycle(); }
  catch (error) { console.error(`[BRIDGE] ${error instanceof Error ? error.message : String(error)}`); }
  await new Promise(resolve => setTimeout(resolve, intervalMs));
}

