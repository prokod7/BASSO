import { requireFood99OfficialContract } from "@/lib/integrations/food99/official-contract";

export async function rejectFood99Order(_externalOrderId: string, _reason: string): Promise<void> {
  return requireFood99OfficialContract();
}

export async function requestFood99Cancellation(_externalOrderId: string, _reason: string): Promise<void> {
  return requireFood99OfficialContract();
}
