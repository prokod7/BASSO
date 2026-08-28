import { createHash, timingSafeEqual } from "crypto";

export type FiscalAuthResult = "authorized" | "unauthorized" | "misconfigured";

const MIN_SECRET_LENGTH = 32;
const MAX_BEARER_LENGTH = 512;

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

export function verifyFiscalAuthorization(
  authorization: string | null,
  configuredKey: string | undefined = process.env.FISCAL_API_KEY,
): FiscalAuthResult {
  if (!configuredKey || configuredKey.length < MIN_SECRET_LENGTH) return "misconfigured";
  if (!authorization) return "unauthorized";

  const match = /^Bearer ([^\s]+)$/.exec(authorization);
  if (!match) return "unauthorized";

  const providedKey = match[1];
  if (!providedKey || providedKey.length > MAX_BEARER_LENGTH) return "unauthorized";

  const expected = digest(configuredKey);
  const provided = digest(providedKey);
  return timingSafeEqual(expected, provided) ? "authorized" : "unauthorized";
}
