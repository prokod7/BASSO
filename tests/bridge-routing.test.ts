import { afterEach, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { POST as claim } from "@/app/api/print/claim/route";
import { POST as complete } from "@/app/api/print/complete/route";

const { admin } = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: admin }));
afterEach(() => vi.unstubAllEnvs());
const id = "10000000-0000-4000-8000-000000000001";
function request(body: object) {
  return new NextRequest("https://example.test", { method: "POST", headers: { "x-print-bridge-key": "test" }, body: JSON.stringify(body) });
}
it("limita a reserva ao destino, exclui o histórico e usa atualização condicional", async () => {
  vi.stubEnv("PRINT_BRIDGE_KEY", "test");
  const calls: { url: URL; body: any }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, body });
    if (init?.method === "GET") return Response.json([{ id, attempts: 0 }]);
    if (body?.status === "processing") return Response.json([{ id, sector: "kitchen", claimed_at: body.claimed_at, payload: {} }]);
    return new Response(null, { status: 204 });
  };
  admin.mockReturnValue(createClient("https://example.test", "test", { global: { fetch: fetcher } }));
  const response = await claim(request({ printers: ["cozinha"] }));
  const { jobs } = await response.json();
  expect(jobs).toHaveLength(1);
  expect(calls[0].body.status).toBe("cancelled");
  expect(calls[0].url.searchParams.get("claimed_at")).toMatch(/^lt\./);
  const filters = calls[1].url.searchParams.getAll("or");
  expect(filters).toContain("(printer_key.in.(cozinha),sector.in.(cozinha))");
  expect(filters.some(filter => filter.includes("created_at.gte.") && filter.includes("next_attempt_at.gte."))).toBe(true);
  expect(calls[2].url.searchParams.get("status")).toBe("eq.queued");
  expect(calls[2].url.searchParams.get("attempts")).toBe("eq.0");
});
it("recusa uma conclusão atrasada e um bridge antigo sem destinos", async () => {
  vi.stubEnv("PRINT_BRIDGE_KEY", "test");
  const claimTime = new Date().toISOString();
  const fetcher: typeof fetch = async (input, init) => {
    const params = new URL(String(input)).searchParams;
    expect(params.get("claimed_at")).toBe("eq." + claimTime);
    expect(params.get("status")).toBe("eq.processing");
    expect(JSON.parse(String(init?.body)).status).toBe("cancelled");
    return Response.json([]);
  };
  admin.mockReturnValue(createClient("https://example.test", "test", { global: { fetch: fetcher } }));
  expect((await claim(request({ limit: 3 }))).status).toBe(400);
  expect((await complete(request({ jobId: id, claimTime, success: false }))).status).toBe(409);
});
