import { describe, expect, it } from "vitest";
import { withoutGreeting } from "@/lib/whatsapp/turn";
import { liveStoreInfo, todayPromotions } from "@/lib/whatsapp/live";
import type { BotContext } from "@/lib/whatsapp/order";

const hours = { sunday: ["18:00", "23:00"], monday: null, tuesday: ["18:00", "23:00"], wednesday: ["18:00", "23:00"], thursday: ["18:00", "23:00"], friday: ["18:00", "23:50"], saturday: ["18:00", "23:50"] } as const;
const context = {
  menu: { flavors: [{ id: "f1", name: "Mozzarella" }, { id: "f2", name: "Bauru" }] },
  zones: [],
  store: { name: "La Forneria Basso", open: true, hours: "", openingHours: hours, pickupTime: "20 a 30 minutos", deliveryTime: "40 a 60 minutos", menuUrl: "x", closedMessage: "", address: "", city: "", state: "SP" },
  pix: { pix_key: null, pix_name: null },
  promotions: [{ id: "p1", name: "Terça Maluca", description: "", badgeText: "", image: "https://x/terca.png", promoPrice: 3999, active: true, paused: false, channels: ["own_delivery", "pickup"], daysOfWeek: [2], pizzaSize: "grande", allowCouponStack: false, sortOrder: 0, targets: [{ id: "t", flavorId: "f1" }, { id: "t2", flavorId: "f2" }] }],
} as unknown as BotContext;

describe("robô: dados vivos", () => {
  it("informa horário, dia e a promoção do dia com sabores", () => {
    const tuesday = new Date("2026-11-10T22:00:00Z"); // terça 19:00 em São Paulo
    const text = liveStoreInfo(context, tuesday);
    expect(text).toContain("AGORA: terça, 19:00");
    expect(text).toContain("TEMPO DE HOJE: retirada 20 a 30 minutos; entrega 40 a 60 minutos");
    expect(text).toContain("segunda-feira: fechado");
    expect(text).toContain("sexta-feira: 18:00 às 23:50");
    expect(text).toMatch(/PROMOÇÕES DE HOJE: \*Terça Maluca\*.*R\$\s?39,99.*Mozzarella, Bauru/);
    expect(todayPromotions(context, tuesday).map((p) => p.image)).toEqual(["https://x/terca.png"]);
    const wednesday = new Date("2026-11-11T22:00:00Z");
    expect(liveStoreInfo(context, wednesday)).toContain("PROMOÇÕES DE HOJE: nenhuma hoje");
    expect(liveStoreInfo(context, wednesday)).toContain("OUTROS DIAS");
  });

  it("tira a saudação das respostas seguintes", () => {
    expect(withoutGreeting("Olá! Prefere a massa *tradicional* ou *integral*?")).toBe("Prefere a massa *tradicional* ou *integral*?");
    expect(withoutGreeting("Boa noite! 😊 Qual sabor?")).toBe("Qual sabor?");
    expect(withoutGreeting("Perfeito, anotado.")).toBe("Perfeito, anotado.");
    expect(withoutGreeting("Olá!")).toBe("Olá!");
  });
});

import { pixCopyText, pixInstructions } from "@/lib/whatsapp/pix";
describe("mensagem do Pix", () => {
  it("segue o padrão da Basso e pede o comprovante", () => {
    const account = { pix_key: "62.332.415/0001-10", pix_name: "LA FORNERIA BASSO COMER", key_type: "cnpj", holder: "La Forneria Basso" };
    const text = pixInstructions({ quote: { total: 4499 } } as never, account);
    expect(text).toContain("Segue nossa chave PIX:");
    expect(text).toContain("CNPJ: *62.332.415/0001-10*\nLa Forneria Basso");
    expect(text).toMatch(/Valor: \*R\$\s?44,99\*/);
    expect(text).toContain("comprovante");
    expect(pixCopyText(account)).toBe("62332415000110");
  });
});

import { judgeReceipt } from "@/lib/whatsapp/pix";
describe("comprovante para a chave CNPJ", () => {
  it("aceita CNPJ completo, mascarado ou pelo nome da conta", () => {
    const account = { pix_key: "62.332.415/0001-10", pix_name: "LA FORNERIA BASSO COMER", key_type: "cnpj", holder: "La Forneria Basso" };
    const base = { is_pix_receipt: true, completed: true, amount_brl: 44.99, recipient_name: null, recipient_key: null, paid_at: null, bank: null };
    expect(judgeReceipt({ ...base, recipient_key: "62.332.415/0001-10" }, 4499, account).ok).toBe(true);
    expect(judgeReceipt({ ...base, recipient_key: "62332415000110" }, 4499, account).ok).toBe(true);
    expect(judgeReceipt({ ...base, recipient_name: "La Forneria Basso Comercio de Alimentos" }, 4499, account).ok).toBe(true);
  });
});

import { statusMessage } from "@/lib/whatsapp/notify";
describe("avisos de status ao cliente", () => {
  it("avisa quando sai para entrega e quando a retirada fica pronta", () => {
    expect(statusMessage("confirmed", "own_delivery", 8, "Pedro")).toBeNull();
    expect(statusMessage("preparing", "own_delivery", 8, "Pedro")).toBeNull();
    expect(statusMessage("ready", "pickup", 8, "Pedro")).toContain("pronto para retirada, Pedro");
    expect(statusMessage("ready", "own_delivery", 8, "Pedro")).toBeNull();
    expect(statusMessage("out_for_delivery", "own_delivery", 8, "Pedro Henrique")).toContain("saiu para entrega, Pedro");
  });
});
