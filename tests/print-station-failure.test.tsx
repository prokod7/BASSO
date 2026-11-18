// @vitest-environment jsdom
import React from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import Station from "@/app/painel/impressao/automatica/page";
import { requestPrint } from "@/components/print/PrintHost";

vi.mock("@/components/print/PrintHost", () => ({ requestPrint: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
  localStorage.clear();
});

it.each([
  ["kitchen", false, 1],
  ["counter", false, 2],
  ["kitchen", true, 1],
] as const)("registra o resultado de %s com falha=%s e %i via(s)", async (sector, failure, copies) => {
  vi.stubGlobal("React", React);
  history.replaceState(null, "", "/?setores=" + sector + "&vias=2&ligar=1");
  const job = { id: "job-1", order_id: "order-1", sector, processed_at: new Date().toISOString() };
  if (failure) vi.mocked(requestPrint).mockRejectedValue(new Error("Impressora indisponível"));
  else vi.mocked(requestPrint).mockResolvedValue();
  const results: { ok: boolean; claimTime: string }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith("/browser-claim")) return Response.json({ jobs: [job] });
    results.push(JSON.parse(String(init.body)));
    return Response.json({ ok: true });
  }));
  render(<Station />);
  await waitFor(() => expect(results).toHaveLength(1));
  expect(requestPrint).toHaveBeenCalledWith(expect.objectContaining({ copies }));
  expect(results[0]).toMatchObject({ ok: !failure, claimTime: job.processed_at });
});

it("dois balcões e uma cozinha processam apenas as vias reservadas na fila simulada", async () => {
  vi.stubGlobal("React", React);
  const queue = ["counter", "kitchen"].map((sector) => ({
    id: sector, order_id: "mesmo-pedido", sector, processed_at: new Date().toISOString(),
  }));
  const completed: string[] = [];
  const polls: string[][] = [];
  vi.mocked(requestPrint).mockResolvedValue();
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    if (url.endsWith("/browser-claim")) {
      polls.push(body.sectors);
      const index = queue.findIndex((job) => body.sectors.includes(job.sector));
      return Response.json({ jobs: index < 0 ? [] : queue.splice(index, 1) });
    }
    if (body.ok) completed.push(body.jobId);
    return Response.json({ ok: true });
  }));
  for (const sector of ["counter", "counter", "kitchen"]) {
    history.replaceState(null, "", "/?setores=" + sector + "&vias=1&ligar=1");
    render(<Station />);
  }
  await waitFor(() => expect(completed.sort()).toEqual(["counter", "kitchen"]));
  expect(polls).toHaveLength(3);
  expect(requestPrint).toHaveBeenCalledTimes(2);
});
