import { NextRequest } from "next/server";
import { handleFiscalOrdersRequest } from "@/lib/integrations/fiscal/handler";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handleFiscalOrdersRequest(request);
}
