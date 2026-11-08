import { describe, expect, it } from "vitest";
import { checkoutSchema } from "@/lib/order-validation";

const base = { customerName: "Maria Teste", customerPhone: "11987654321", channel: "own_delivery" as const, paymentMethod: "pix" as const };
const address = { cep: "", street: "Rua do Progresso", number: "120", district: "Centro", city: "Rio Grande da Serra", state: "SP" };

describe("checkout do cliente", () => {
  it("aceita entrega sem CEP", () => {
    expect(checkoutSchema.safeParse({ ...base, address }).success).toBe(true);
  });
  it("aceita CEP com 8 números e rejeita incompleto", () => {
    expect(checkoutSchema.safeParse({ ...base, address: { ...address, cep: "09450000" } }).success).toBe(true);
    const bad = checkoutSchema.safeParse({ ...base, address: { ...address, cep: "0945" } });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0]?.message).toMatch(/CEP inválido/);
  });
  it("mostra mensagens em português para rua e número ausentes", () => {
    const noStreet = checkoutSchema.safeParse({ ...base, address: { ...address, street: "" } });
    expect(noStreet.error?.issues[0]?.message).toBe("Informe a rua.");
    const noNumber = checkoutSchema.safeParse({ ...base, address: { ...address, number: " " } });
    expect(noNumber.error?.issues[0]?.message).toBe("Informe o número da casa.");
  });
});
