import type { OrderStatus } from "@/types";
import { requireFood99OfficialContract } from "@/lib/integrations/food99/official-contract";

export async function updateFood99OrderStatus(_externalOrderId: string, _status: OrderStatus): Promise<void> {
  return requireFood99OfficialContract();
}
