import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

const exec = promisify(execFile);
it("perda de conexão depois do spool não informa falha de impressão nem repete o arquivo na reinicialização", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "basso-bridge-"));
  try {
    const config = path.join(dir, "config.json");
    await writeFile(config, JSON.stringify({ baseUrl: "https://example.test", apiKey: "test", printers: { cozinha: { type: "file", directory: path.join(dir, "spool") } } }));
    const job = { id: "job-1", printer_key: "cozinha", sector: "kitchen", claimed_at: new Date().toISOString(), payload: {} };
    const jobsFile = path.join(dir, "jobs.json");
    await writeFile(jobsFile, JSON.stringify([job]));
    const run = (lost: boolean) => exec(process.execPath, ["--import", path.resolve("tests/fixtures/bridge-transport.mjs"), "bridge/print-bridge.mjs", config], {
      env: { ...process.env, BASSO_BRIDGE_TEST_DIR: dir, BASSO_TEST_ACK_LOST: String(lost) }, timeout: 10000,
    });
    await run(true);
    await writeFile(jobsFile, "[]");
    await run(false);
    const calls = (await readFile(path.join(dir, "calls.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line));
    expect(calls.filter(c => c.endpoint.endsWith("/complete")).map(c => c.body)).toEqual([{ jobId: job.id, claimTime: job.claimed_at, success: true }]);
    expect(calls.filter(c => c.endpoint.endsWith("/claim")).map(c => c.body)).toEqual([{ printers: ["cozinha"] }, { printers: ["cozinha"] }]);
    expect(await readdir(path.join(dir, "spool"))).toHaveLength(1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
