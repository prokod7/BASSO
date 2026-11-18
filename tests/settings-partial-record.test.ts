import { NextRequest } from "next/server";
import { expect, it, vi } from "vitest";
import { PATCH } from "@/app/api/settings/route";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn(async () => ({ error: null })) }));
vi.mock("@/lib/authz", () => ({ requireOperationalRole: async () => ({ userId: "demo" }) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc, from: () => ({
      select() { return this; }, order() { return this; }, limit() { return this; },
      single: async () => ({ data: { id: "config" } }), insert: async () => ({ error: null }),
    }),
  }),
}));
it("salva o subtítulo de uma categoria sem exigir as demais após a atualização do validador", async () => {
  const config = { site: { sectionSubtitles: { premium: "Sabores especiais" } } };
  const response = await PATCH(new NextRequest("https://example.test", { method: "PATCH", body: JSON.stringify({ config }) }));
  expect(response.status).toBe(200);
  expect(rpc).toHaveBeenCalledWith("patch_business_settings", { p_id: "config", p_patch: expect.objectContaining({ config }) });
});
