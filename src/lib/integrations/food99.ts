import type { ExternalOrder, MarketplaceAdapter } from "@/lib/integrations/types";
import type { OrderStatus } from "@/types";
import { food99CredentialStatus } from "@/lib/integrations/food99/config";
import { validateFood99Webhook } from "@/lib/integrations/food99/webhook";
import { acceptFood99Order } from "@/lib/integrations/food99/orders";
import { normalizeFood99Order } from "@/lib/integrations/food99/mapper";
import { updateFood99OrderStatus } from "@/lib/integrations/food99/status";
import { rejectFood99Order, requestFood99Cancellation } from "@/lib/integrations/food99/cancellation";

/**
 * 99Food adapter safety shell.
 *
 * The provider-specific modules below are the only places that may receive official
 * 99Food HTTP contract details. Until those pages are supplied, each operation throws
 * OFFICIAL_DOCUMENTATION_REQUIRED instead of guessing endpoints, headers or payloads.
 */
export class Food99Adapter implements MarketplaceAdapter {
  readonly provider = "99food" as const;

  async verifyWebhook(rawBody: string, headers: Headers): Promise<boolean> {
    await validateFood99Webhook(rawBody, headers);
    return true;
  }

  normalizeOrder(payload: unknown): ExternalOrder {
    return normalizeFood99Order(payload);
  }

  async acceptOrder(externalId: string): Promise<void> {
    await acceptFood99Order(externalId);
  }

  async rejectOrder(externalId: string, reason: string): Promise<void> {
    await rejectFood99Order(externalId, reason);
  }

  async updateStatus(externalId: string, status: OrderStatus): Promise<void> {
    await updateFood99OrderStatus(externalId, status);
  }

  async cancelOrder(externalId: string, reason: string): Promise<void> {
    await requestFood99Cancellation(externalId, reason);
  }

  async health(): Promise<{ ok: boolean; detail: string }> {
    const { configured, missing } = food99CredentialStatus();
    if (!configured) return { ok: false, detail: `Aguardando credenciais: ${missing.join(", ")}.` };
    return {
      ok: false,
      detail: "Credenciais presentes. Falta aplicar o contrato oficial da Plataforma Aberta 99Food (autenticação, assinatura, eventos e endpoints) antes de habilitar chamadas reais.",
    };
  }
}
