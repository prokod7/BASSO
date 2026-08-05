#!/usr/bin/env node
import net from "node:net";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const configPath = process.argv[2] || process.env.PRINT_BRIDGE_CONFIG || path.join(process.cwd(), "bridge", "config.json");
const config = JSON.parse(await fs.readFile(configPath, "utf8"));
if (!config.baseUrl || !config.apiKey) throw new Error("baseUrl e apiKey são obrigatórios no config.json.");
const intervalMs = Math.max(1500, Number(config.pollIntervalMs || 3000));
let stopped = false;
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

function render(job) {
  const payload = job.payload || {};
  const order = payload.order || {};
  const items = payload.items || [];
  const lines = [
    center("LA FORNERIA BASSO"),
    center(`${String(job.sector || "").toUpperCase()} ${job.is_reprint ? "- REIMPRESSAO" : ""}`),
    line(),
    `PEDIDO #${order.number || order.id || job.order_id || ""}`,
    `CANAL: ${order.channel || ""}`,
    `CLIENTE: ${order.customer_name || ""}`,
    order.table_number ? `MESA: ${order.table_number}` : "",
    line()
  ];
  for (const item of items) {
    lines.push(`${item.quantity || 1}x ${item.name_snapshot || item.name || "Item"}`);
    if (item.unit_price_cents != null) lines.push(`   ${money(item.unit_price_cents)}`);
    const selection = item.selection || {};
    if (selection.size) lines.push(`   ${selection.size} | massa ${selection.mass || "tradicional"}`);
    if (selection.flavorA) lines.push(`   Sabor: ${selection.flavorA}${selection.flavorB ? ` / ${selection.flavorB}` : ""}`);
    if (selection.removedA?.length) lines.push(`   SEM: ${selection.removedA.join(", ")}`);
    if (selection.removedB?.length) lines.push(`   SEM 2a METADE: ${selection.removedB.join(", ")}`);
    if (selection.addons && Object.keys(selection.addons).length) lines.push(`   ADICIONAIS: ${Object.entries(selection.addons).filter(([, q]) => Number(q) > 0).map(([id, q]) => `${q}x ${id}`).join(", ")}`);
    if (selection.notes) lines.push(`   OBS: ${selection.notes}`);
    lines.push("");
  }
  if (order.notes) lines.push(line(), `OBS PEDIDO: ${order.notes}`);
  lines.push(line(), new Date().toLocaleString("pt-BR"), "", "", "");
  const text = normalize(lines.filter(Boolean).join("\n"));
  // ESC/POS: initialize, text, feed, partial cut.
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
  const directory = printer.directory || path.join(process.cwd(), "bridge", "spool");
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, `${Date.now()}-${printer.key || "printer"}.bin`), bytes);
}

async function sendSystem(printer, bytes) {
  const tmp = path.join(os.tmpdir(), `pedidopro-${Date.now()}.txt`);
  await fs.writeFile(tmp, bytes);
  try {
    if (process.platform === "win32") {
      if (!/^[\w .()_-]+$/.test(printer.name || "")) throw new Error("Nome de impressora inválido.");
      await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `Get-Content -LiteralPath '${tmp.replaceAll("'", "''")}' | Out-Printer -Name '${printer.name.replaceAll("'", "''")}'`]);
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

async function cycle() {
  const { jobs = [] } = await request("/api/print/claim", { limit: Number(config.batchSize || 3) });
  for (const job of jobs) {
    try {
      await print(job);
      await request("/api/print/complete", { jobId: job.id, success: true });
      console.log(`[OK] ${job.id} -> ${job.printer_key}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await request("/api/print/complete", { jobId: job.id, success: false, error: message }).catch(() => undefined);
      console.error(`[ERRO] ${job.id}: ${message}`);
    }
  }
}

console.log(`PedidoPro Print Bridge ativo: ${config.baseUrl}`);
while (!stopped) {
  try { await cycle(); }
  catch (error) { console.error(`[BRIDGE] ${error instanceof Error ? error.message : String(error)}`); }
  await new Promise(resolve => setTimeout(resolve, intervalMs));
}
