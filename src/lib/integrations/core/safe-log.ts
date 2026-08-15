const SECRET_KEYS = /secret|token|authorization|password|credential|api[-_]?key|client[-_]?secret/i;

export function redactIntegrationValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactIntegrationValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      SECRET_KEYS.test(key) ? "[REDACTED]" : redactIntegrationValue(entry),
    ]),
  );
}

export function maskedPresence(value: string | undefined): "configured" | "missing" {
  return value?.trim() ? "configured" : "missing";
}
