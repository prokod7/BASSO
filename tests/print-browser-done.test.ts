import { expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/print/browser-done/route";

const { update, eq } = vi.hoisted(() => ({ update: vi.fn(), eq: vi.fn() }));
vi.mock("@/lib/authz", () => ({ requireOperationalRole: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      const query = { update, eq, is: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), maybeSingle: async () => ({ data: { id: "job" } }) };
      update.mockReturnValue(query);
      eq.mockReturnValue(query);
      return query;
    },
  }),
}));
it("guarda a falha da estação antiga mesmo quando ela informa sucesso na terceira tentativa", async () => {
  const res = await POST(new NextRequest("https://example.test", { method: "POST", body: JSON.stringify({
    jobId: "00000000-0000-4000-8000-000000000001", ok: true, error: "Impressora indisponível",
  }) }));
  expect(res.status).toBe(200);
  expect(update).toHaveBeenCalledWith({ status: "cancelled", last_error: "Impressora indisponível" });
  expect(eq).toHaveBeenCalledWith("last_error", "Reserva de estação anterior");
});
