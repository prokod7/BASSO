import type { ExternalOrder } from "@/lib/integrations/types";
import { requireFood99OfficialContract } from "@/lib/integrations/food99/official-contract";

export function normalizeFood99Order(_payload: unknown): ExternalOrder {
  return requireFood99OfficialContract();
}
