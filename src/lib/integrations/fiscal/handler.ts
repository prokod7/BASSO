import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyFiscalAuthorization } from "./auth";
import { fetchFiscalOrders } from "./orders";
import { FiscalQueryError, parseFiscalQuery } from "./schemas";

export type FiscalHandlerDependencies = {
  apiKey?: string;
  createDb?: typeof createAdminClient;
  fetchOrders?: typeof fetchFiscalOrders;
};

function fiscalJson(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Vary": "Authorization",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function handleFiscalOrdersRequest(
  request: NextRequest,
  dependencies: FiscalHandlerDependencies = {},
) {
  const configuredKey = dependencies.apiKey !== undefined
    ? dependencies.apiKey
    : process.env.FISCAL_API_KEY;
  const authResult = verifyFiscalAuthorization(request.headers.get("authorization"), configuredKey);

  if (authResult === "misconfigured") {
    return fiscalJson({ error: "Integração fiscal não configurada." }, 503);
  }
  if (authResult !== "authorized") {
    return fiscalJson({ error: "Não autorizado." }, 401);
  }

  let params;
  try {
    params = parseFiscalQuery(request.nextUrl.searchParams);
  } catch (error) {
    if (error instanceof FiscalQueryError) return fiscalJson({ error: error.message }, 400);
    return fiscalJson({ error: "Parâmetros inválidos." }, 400);
  }

  const createDb = dependencies.createDb || createAdminClient;
  const db = createDb();
  if (!db) return fiscalJson({ error: "Integração fiscal indisponível." }, 503);

  try {
    const fetchOrders = dependencies.fetchOrders || fetchFiscalOrders;
    const response = await fetchOrders(db, params);
    return fiscalJson(response, 200);
  } catch {
    // Não registramos token, query bruta, payload do pedido, stack trace ou erro do banco.
    console.error("[fiscal-orders] falha segura ao consultar pedidos");
    return fiscalJson({ error: "Falha ao consultar pedidos." }, 500);
  }
}
