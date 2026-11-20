import { describe, expect, it } from "vitest";
import { removeDessertPitch } from "@/lib/whatsapp/turnRules";

describe("atendimento sem oferta de sobremesa", () => {
  it("retira a oferta antiga com a legenda", () => {
    expect(removeDessertPitch("Para finalizar, gostaria de incluir uma sobremesa em seu pedido?\n\nPudim no Copo: Tradicional — R$ 15,00")).toBe("Podemos seguir com o pedido?");
  });
  it("preserva a próxima pergunta e a escolha de um item solicitado", () => {
    expect(removeDessertPitch("Quer adicionar um pudim? Entrega ou retirada?")).toBe("Entrega ou retirada?");
    expect(removeDessertPitch("Qual sabor de pudim você prefere?")).toBe("Qual sabor de pudim você prefere?");
  });
});
