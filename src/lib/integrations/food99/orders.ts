import type { ExternalOrder } from "@/lib/integrations/types";
import { requireFood99OfficialContract } from "@/lib/integrations/food99/official-contract";

/**
 * These functions are deliberately contract-gated. They represent the exact seams
 * where the official 99Food Open Platform contract will be applied once supplied.
 * No URL, HTTP method, header, event field or monetary shape is guessed here.
 */
export async function fetchFood99Order(_externalOrderId: string): Promise<unknown> {
  return requireFood99OfficialContract();
}

export function mapFood99Order(_payload: unknown): ExternalOrder {
  return requireFood99OfficialContract();
}

export async function resolveFood99OrderFromEvent(_eventPayload: unknown): Promise<ExternalOrder> {
  // Official implementation will inspect the documented event envelope and either
  // normalize an embedded full order or fetch it by the documented order identifier.
  return requireFood99OfficialContract();
}

export async function acceptFood99Order(_externalOrderId: string): Promise<void> {
  return requireFood99OfficialContract();
}
