import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("production security hardening", () => {
  it("never enables demo auth through a NEXT_PUBLIC variable", () => {
    const authz = source("src/lib/authz.ts");
    const middleware = source("src/middleware.ts");

    expect(authz).not.toContain("NEXT_PUBLIC_DEMO_MODE");
    expect(middleware).not.toContain("NEXT_PUBLIC_DEMO_MODE");
    expect(authz).toContain('process.env.NODE_ENV !== "production"');
    expect(middleware).toContain('process.env.NODE_ENV !== "production"');
    expect(authz).toContain('process.env.DEMO_MODE === "true"');
    expect(middleware).toContain('process.env.DEMO_MODE === "true"');
  });

  it("keeps privileged SECURITY DEFINER RPCs closed to browser roles", () => {
    const migration = source("supabase/migrations/020_production_security_and_performance_hardening.sql");

    expect(migration).toContain("create schema if not exists private");
    expect(migration).toContain("create or replace function private.current_role()");
    expect(migration).toContain("create or replace function private.can_manage_operation()");
    expect(migration).toContain("revoke execute on function %s from anon");
    expect(migration).toContain("revoke execute on function %s from authenticated");
    expect(migration).toContain("grant execute on function %s to service_role");
    expect(migration).toContain("alter default privileges for role postgres in schema public revoke execute on functions from authenticated");
    expect(migration).toContain("alter extension citext set schema extensions");
  });

  it("closes the MU12 print enqueue RPC again after it is recreated", () => {
    const migration = source("supabase/migrations/023_operational_consistency_and_security.sql");

    expect(migration).toContain("revoke execute on function public.enqueue_order_print_jobs(text) from public");
    expect(migration).toContain("revoke execute on function public.enqueue_order_print_jobs(text) from anon");
    expect(migration).toContain("revoke execute on function public.enqueue_order_print_jobs(text) from authenticated");
    expect(migration).toContain("grant execute on function public.enqueue_order_print_jobs(text) to service_role");
  });
});

