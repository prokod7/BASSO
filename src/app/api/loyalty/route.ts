import { NextRequest, NextResponse } from "next/server";
import { requireOperationalRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    await requireOperationalRole(["manager", "counter"], "loyalty.authorize");
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
    const query = (request.nextUrl.searchParams.get("q") || "").trim();
    let customerQuery = db.from("loyalty_accounts").select("customer_id,balance,lifetime_points,rewards_redeemed,updated_at,customers!inner(name,phone,active)").order("balance", { ascending: false }).limit(500);
    if (query) customerQuery = customerQuery.or(`name.ilike.%${query.replaceAll(",", " ")}%,phone.ilike.%${query.replaceAll(",", " ")}%`, { foreignTable: "customers" });
    const [accountsResult, pendingResult] = await Promise.all([
      customerQuery,
      db.from("loyalty_reward_authorizations").select("id,customer_id,flavor_id,status,expires_at,created_at").eq("status", "pending").gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false })
    ]);
    if (accountsResult.error) throw accountsResult.error;
    if (pendingResult.error) throw pendingResult.error;
    const pendingByCustomer = new Map((pendingResult.data || []).map((row: any) => [row.customer_id, row]));
    const accounts = (accountsResult.data || []).filter((row: any) => row.customers?.active !== false).map((row: any) => ({
      customerId: row.customer_id,
      name: row.customers?.name || "Cliente",
      phone: row.customers?.phone || "",
      balance: row.balance,
      lifetimePoints: row.lifetime_points,
      rewardsRedeemed: row.rewards_redeemed,
      updatedAt: row.updated_at,
      pendingAuthorization: pendingByCustomer.get(row.customer_id) || undefined
    }));
    return NextResponse.json({ accounts }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao consultar fidelidade." }, { status: 400 });
  }
}
