import { IntegrationDocumentationRequiredError } from "@/lib/integrations/core/errors";

export const REDE_SMARTPOS_DOCS_REQUIRED = [
  "SDK/App2App oficial da Laranjinha Smart Store",
  "fluxo oficial de inicialização e retorno de pagamento",
  "identificação oficial do terminal/dispositivo",
  "cancelamento/estorno suportado pelo SDK",
  "processo de certificação/homologação do aplicativo",
] as const;

export function requireRedeSmartPosContract(): never {
  throw new IntegrationDocumentationRequiredError("Laranjinha Smart", [...REDE_SMARTPOS_DOCS_REQUIRED]);
}
