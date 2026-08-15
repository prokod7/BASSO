export interface Food99WebhookEnvelope {
  rawBody: string;
  headers: Headers;
}

export interface Food99DiagnosticState {
  environment: "test" | "production";
  configured: boolean;
  operational: boolean;
  appShopId: string;
  missingEnv: string[];
  credentials: Record<string, "configured" | "missing">;
  officialContractReady: boolean;
  blocker?: string;
}
