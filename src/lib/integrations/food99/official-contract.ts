import { IntegrationDocumentationRequiredError } from "@/lib/integrations/core/errors";

export const FOOD99_OFFICIAL_DOCS_REQUIRED = [
  "método oficial de autenticação e endpoint de token",
  "algoritmo/cabeçalhos oficiais de validação do webhook",
  "envelope e tipos oficiais dos eventos de pedido/cancelamento/finalização",
  "endpoint oficial de consulta do pedido completo",
  "endpoints e payloads oficiais de aceite, status e cancelamento",
  "formato monetário oficial e estrutura oficial de APIItemID",
] as const;

/**
 * Safety gate. The previous project contained guessed 99Food endpoints and headers.
 * They were intentionally removed in Mega Update 06. This function must only be
 * replaced after the corresponding official 99Food Platform documentation is supplied.
 */
export function requireFood99OfficialContract(): never {
  throw new IntegrationDocumentationRequiredError("99Food", [...FOOD99_OFFICIAL_DOCS_REQUIRED]);
}
