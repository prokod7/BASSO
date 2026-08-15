import type { CardTerminalAdapter, CardTransactionRequest, CardTransactionResult } from "@/lib/integrations/types";
import { requireRedeSmartPosContract } from "@/lib/integrations/rede/official-contract";

/**
 * Safe SmartPOS shell. The previous implementation guessed REST endpoints for Rede.
 * For La Forneria Basso the target is Laranjinha Smart Store / SmartPOS. No payment
 * request is emitted until the official SDK/App2App contract is supplied and certified.
 */
export class RedeAdapter implements CardTerminalAdapter {
  async charge(_request: CardTransactionRequest): Promise<CardTransactionResult> {
    return requireRedeSmartPosContract();
  }
  async cancel(_externalId: string, _amountCents: number): Promise<CardTransactionResult> {
    return requireRedeSmartPosContract();
  }
  async refund(_externalId: string, _amountCents: number): Promise<CardTransactionResult> {
    return requireRedeSmartPosContract();
  }
  async health(): Promise<{ ok: boolean; detail: string }> {
    return { ok: false, detail: "Aguardando SDK/App2App e certificação oficial da Laranjinha Smart Store." };
  }
}
