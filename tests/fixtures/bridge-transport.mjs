// Transporte de homologação local. Registra as chamadas sem usar a rede.
import fs from "node:fs/promises";
import path from "node:path";
const dir = process.env.BASSO_BRIDGE_TEST_DIR;
globalThis.fetch = async (url, options) => {
  const endpoint = new URL(url).pathname;
  const body = JSON.parse(options.body);
  await fs.appendFile(path.join(dir, "calls.jsonl"), JSON.stringify({ endpoint, body }) + "\n");
  if (endpoint.endsWith("/claim")) {
    const jobs = JSON.parse(await fs.readFile(path.join(dir, "jobs.json"), "utf8"));
    if (!jobs.length) process.emit("SIGTERM");
    return Response.json({ jobs });
  }
  if (endpoint.endsWith("/complete")) {
    process.emit("SIGTERM");
    if (process.env.BASSO_TEST_ACK_LOST === "true") throw new Error("Conexão interrompida após envio");
  }
  return Response.json({});
};
