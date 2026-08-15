import { requireFood99OfficialContract } from "@/lib/integrations/food99/official-contract";

export interface Food99VerifiedEvent {
  eventId: string;
  eventType: string;
  externalOrderId?: string;
  payload: Record<string, unknown>;
}

export async function validateFood99Webhook(_rawBody: string, _headers: Headers): Promise<void> {
  return requireFood99OfficialContract();
}

export function parseFood99Webhook(_rawBody: string, _headers: Headers): Food99VerifiedEvent {
  return requireFood99OfficialContract();
}
