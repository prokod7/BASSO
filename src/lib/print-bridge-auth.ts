import { createHash, timingSafeEqual } from "crypto";

/**
 * Valida a chave da ponte de impressão em tempo constante.
 * Sem PRINT_BRIDGE_KEY configurada, nenhuma chave é aceita.
 */
export function isAuthorizedPrintBridge(provided: string | null): provided is string {
  const expected = process.env.PRINT_BRIDGE_KEY;
  if (!provided || !expected) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
