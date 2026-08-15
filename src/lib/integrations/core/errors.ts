export class IntegrationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly options: { provider?: string; retryable?: boolean; httpStatus?: number; details?: Record<string, unknown> } = {},
  ) {
    super(message);
    this.name = "IntegrationError";
  }
}

export class IntegrationDocumentationRequiredError extends IntegrationError {
  constructor(provider: string, missing: string[]) {
    super(
      `A integração ${provider} está preparada, mas depende da documentação oficial para: ${missing.join(", ")}.`,
      "OFFICIAL_DOCUMENTATION_REQUIRED",
      { provider, retryable: false, details: { missing } },
    );
    this.name = "IntegrationDocumentationRequiredError";
  }
}

export function integrationErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Falha desconhecida na integração.";
}
