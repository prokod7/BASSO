import { describe, expect, it } from "vitest";
import { checkoutSchema } from "@/lib/order-validation";

const base = { customerName: "Maria Teste", customerPhone: "11987654321", channel: "own_delivery" as const, paymentMethod: "pix" as const };
const address = { cep: "", street: "Rua do Progresso", number: "120", district: "Centro", city: "Rio Grande da Serra", state: "SP" };

describe("checkout do cliente", () => {
  it("aceita entrega sem CEP", () => {
    expect(checkoutSchema.safeParse({ ...base, address }).success).toBe(true);
  });
  it("endereço não exige CEP (campo removido do sistema)", () => {
    const { cep: _cep, ...withoutCep } = address as typeof address & { cep?: string };
    expect(checkoutSchema.safeParse({ ...base, address: withoutCep }).success).toBe(true);
    expect(checkoutSchema.safeParse({ ...base, address: { ...address, cep: "" } }).success).toBe(true);
  });
  it("mostra mensagens em português para rua e número ausentes", () => {
    const noStreet = checkoutSchema.safeParse({ ...base, address: { ...address, street: "" } });
    expect(noStreet.error?.issues[0]?.message).toBe("Informe a rua.");
    const noNumber = checkoutSchema.safeParse({ ...base, address: { ...address, number: " " } });
    expect(noNumber.error?.issues[0]?.message).toBe("Informe o número da casa.");
  });
});
