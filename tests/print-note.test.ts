import { describe, it, expect } from "vitest";
import { printableOrderNote } from "../src/lib/print-note";
describe("printableOrderNote", () => {
  it("omite auditoria PIX e mantém instruções reais", () => {
    expect(printableOrderNote("Pedido pelo WhatsApp. Pix: comprovante conferido pela IA (R$ 79,00 (PicPay)). Confirme o recebimento no banco. Sem cebola")).toBe("Sem cebola");
  });
  it("preserva observações do cliente", () => {
    expect(printableOrderNote("Não cortar. Tocar campainha.")).toBe("Não cortar. Tocar campainha.");
  });
});
