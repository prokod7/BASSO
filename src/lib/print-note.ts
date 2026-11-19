/** Remove somente anotações automáticas conhecidas da via impressa; não altera o pedido. */
export function printableOrderNote(value?: string | null): string {
  return String(value || "")
    .replace(/Pedido pelo WhatsApp\./gi, "")
    .replace(/Pix:\s*comprovante conferido pela IA\s*\([\s\S]*?\)\.\s*Confirme o recebimento no banco\./gi, "")
    .trim();
}
