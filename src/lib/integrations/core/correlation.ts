import { randomBytes } from "crypto";

export function integrationCorrelationId(provider: string): string {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  return `${provider.toUpperCase()}-${stamp}-${randomBytes(4).toString("hex").toUpperCase()}`;
}
