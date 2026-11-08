import { describe, expect, it, vi } from "vitest";
import raw from "@/data/catalog.json";
import { addonPrice, pizzaTotal } from "@/lib/pricing";
import { applyPizzaOptions, DEFAULT_PIZZA_OPTIONS } from "@/lib/pizza-options";
import type { RuntimeMenu } from "@/lib/server-menu-pricing";
import type { PizzaSelection } from "@/types";
import { compactCatalog, matchDistrict, resolveDraft, type Draft, type DraftItem, type Zone } from "@/lib/whatsapp/catalog";
import { affirmative, confirmation, ordersContext, pickLead, phoneVariants, summarize, type Pending } from "@/lib/whatsapp/domain";
import { judgeReceipt } from "@/lib/whatsapp/pix";
import { assistantTurn, CONFIRM_LINE, HUMAN_REPLY } from "@/lib/whatsapp/turn";
import { pendingAfter } from "@/lib/whatsapp/turnRules";
import { toolSchema, instructions } from "@/lib/whatsapp/ai";
import { namesFor, type BotContext } from "@/lib/whatsapp/order";

applyPizzaOptions(DEFAULT_PIZZA_OPTIONS);
const menu: RuntimeMenu = {
  pizzaOptions: DEFAULT_PIZZA_OPTIONS,
  categories: raw.categories.map((c, i) => ({ id: c.id, name: c.name, kind: c.type, sortOrder: i, active: true })),
  flavors: raw.flavors.map((f) => ({ ...f, category: f.category as "traditional", availableChannels: [], availableSchedule: {} })),
  addons: raw.addons,
  products: [...raw.beverages, ...raw.desserts, raw.combo].map((p) => ({
    id: p.id, name: p.name, description: p.description, category: p.category, price: p.price, active: true, stockTracked: false,
    availableChannels: [], availableSchedule: {}, stockAvailable: true, config: "options" in p ? (p as typeof raw.combo).options : {},
  })),
};
const zones: Zone[] = [
  { name: "Centro RGS", city: "Rio Grande da Serra", districts: ["Centro", "Jardim Santa Tereza", "Vila Lopes"], fee_cents: 500, minimum_order_cents: 0 },
  { name: "Ribeirão", city: "Ribeirão Pires", districts: ["Centro", "Jardim Caçula"], fee_cents: 900, minimum_order_cents: 4000 },
];
const store = { name: "La Forneria Basso", address: "Rua do Progresso, 407 — Centro — Rio Grande da Serra/SP" };
const catalog = compactCatalog(menu, zones, store);
const code = (name: string) => catalog.codes.flavor.get(raw.flavors.find((f) => f.name === name)!.id)!;
const addon = (id: string) => catalog.codes.addon.get(id)!;
const pizza = (over: Partial<DraftItem>): DraftItem => ({ type: "pizza", code: "", qty: 1, size: null, mass: null, flavors: [], addons: [], remove: [], sweet_base: null, cut: null, combo: null, notes: "", ...over });
const draft = (items: DraftItem[], over: Partial<Draft> = {}): Draft => ({ kind: "pickup", name: "Ana", method: "credit", change_for: null, coupon: null, address: null, items, ...over });

describe("cardápio compacto da Basso", () => {
  it("explica a borda padrão, adicionais por metade e lista o pudim, sem IDs internos", () => {
    expect(catalog.text).toMatch(/borda tradicional da casa. NÃO existem bordas recheadas/i);
    expect(catalog.text).toMatch(/só em uma metade do meio a meio/);
    expect(catalog.text).toContain("Pudim no Copo Americano - Tradicional 15");
    expect(catalog.text).toContain("Pudim no Copo Americano - Frutas Vermelhas 15");
    expect(catalog.text).toContain("SABORES PREMIUM");
    expect(catalog.text).toContain("Jardim Santa Tereza 5");
    expect(catalog.text).not.toContain("calabresa-tradicional");
    expect(catalog.text).not.toContain("Massa de longa fermentação, passata");
  });
  it("gera códigos estáveis para o mesmo cardápio (cache de prompt)", () => {
    expect(compactCatalog(menu, zones, store).text).toBe(catalog.text);
  });
  it("a instrução não pergunta borda e oferece pudim e vinho", () => {
    const text = instructions({ name: "La Forneria Basso", menuUrl: "https://x.test" });
    expect(text).toMatch(/Borda: NÃO pergunte/);
    expect(text).toContain("Pudim no Copo Americano");
    expect(text).toMatch(/vinho/i);
    expect(JSON.stringify(toolSchema)).not.toMatch(/border|borda/i);
  });
});

describe("pedido montado pela IA", () => {
  it("adicional só na metade cobra 50% e fica na metade certa", () => {
    const basket = resolveDraft(draft([pizza({ flavors: [code("Calabresa Tradicional"), code("Margherita")], addons: [{ code: addon("bacon"), qty: 1, half: 2 }] })]), menu, catalog, "5511999998888", zones, { city: "Rio Grande da Serra", state: "SP" });
    const selection = basket.items[0].selection as PizzaSelection;
    expect(selection.addonPlacements).toEqual({ bacon: "halfB" });
    expect(addonPrice(selection.addons, raw.addons, selection.addonPlacements)).toBe(500);
    expect(pizzaTotal(selection)).toBe(Math.round((5000 + 5700) / 2) + 500);
    expect(basket.customerPhone).toBe("11999998888");
  });
  it("mesmo adicional nas duas metades vira pizza inteira; pizza inteira ignora metade", () => {
    const both = resolveDraft(draft([pizza({ flavors: [code("Mozzarella"), code("Bacon")], addons: [{ code: addon("catupiry"), qty: 1, half: 1 }, { code: addon("catupiry"), qty: 1, half: 2 }] })]), menu, catalog, "5511999998888", zones, { city: "", state: "SP" });
    expect((both.items[0].selection as PizzaSelection).addonPlacements).toEqual({ catupiry: "whole" });
    expect((both.items[0].selection as PizzaSelection).addons).toEqual({ catupiry: 2 });
    const single = resolveDraft(draft([pizza({ flavors: [code("Mozzarella")], addons: [{ code: addon("milho"), qty: 1, half: 2 }] })]), menu, catalog, "5511999998888", zones, { city: "", state: "SP" });
    expect((single.items[0].selection as PizzaSelection).addonPlacements).toEqual({ milho: "whole" });
  });
  it("remove ingrediente da metade certa e recusa ingrediente que o sabor não leva", () => {
    const basket = resolveDraft(draft([pizza({ flavors: [code("Calabresa Tradicional"), code("Portuguesa")], remove: [{ ingredient: "cebola", half: 0 }] })]), menu, catalog, "5511999998888", zones, { city: "", state: "SP" });
    const selection = basket.items[0].selection as PizzaSelection;
    expect(selection.removedA.length + selection.removedB.length).toBeGreaterThan(0);
    expect(() => resolveDraft(draft([pizza({ flavors: [code("Mozzarella")], remove: [{ ingredient: "abacaxi", half: 0 }] })]), menu, catalog, "5511999998888", zones, { city: "", state: "SP" })).toThrow(/não leva/);
  });
  it("pizza doce leva corte e base de avelã; salgada não", () => {
    const sweet = resolveDraft(draft([pizza({ size: "broto", flavors: [code("Brigadeiro")], cut: "cut", sweet_base: "hazelnut" })]), menu, catalog, "5511999998888", zones, { city: "", state: "SP" });
    const selection = sweet.items[0].selection as PizzaSelection;
    expect(selection).toMatchObject({ size: "broto", cutPreference: "cut", sweetBase: "hazelnut-zero" });
    expect(pizzaTotal(selection)).toBe(4000 + DEFAULT_PIZZA_OPTIONS.hazelnut.price);
    const savory = resolveDraft(draft([pizza({ flavors: [code("Mozzarella")], cut: "cut" })]), menu, catalog, "5511999998888", zones, { city: "", state: "SP" });
    expect((savory.items[0].selection as PizzaSelection).cutPreference).toBeUndefined();
  });
  it("código inexistente é rejeitado, nunca remapeado", () => {
    expect(() => resolveDraft(draft([pizza({ flavors: ["s000"] })]), menu, catalog, "5511999998888", zones, { city: "", state: "SP" })).toThrow(/não está disponível/);
  });
  it("monta o combo com sabores, doce e bebida do combo", () => {
    const combo = catalog.codes.combo.get(raw.combo.id)!;
    const basket = resolveDraft(draft([{ ...pizza({}), type: "combo", code: combo, combo: { flavors: [code("Mozzarella")], second_flavors: [], sweet_flavor: code("Brigadeiro"), beverage: catalog.codes.product.get("fanta-uva-2-l")! } }]), menu, catalog, "5511999998888", zones, { city: "", state: "SP" });
    expect(basket.items[0]).toMatchObject({ kind: "combo", productId: raw.combo.id, selection: { grandeFlavor: "mozzarella", sweetFlavor: "brigadeiro", beverage: "fanta-uva-2-l" } });
  });
  it("entrega: bairro reconhecido do jeito que o cliente escreve; sem CEP", () => {
    const basket = resolveDraft(draft([pizza({ flavors: [code("Mozzarella")] })], { kind: "delivery", address: { street: "Rua A", number: "10", complement: "", neighborhood: "santa tereza", city: "", reference: "" } }), menu, catalog, "5511999998888", zones, { city: "Rio Grande da Serra", state: "SP" });
    expect(basket.address).toMatchObject({ district: "Jardim Santa Tereza", city: "Rio Grande da Serra", state: "SP", cep: "" });
  });
});

describe("bairros", () => {
  it("reconhece acento, prefixo, s/z e erro pequeno", () => {
    expect(matchDistrict("Santa Teresa", "", zones).district).toBe("Jardim Santa Tereza");
    expect(matchDistrict("vl lopes", "", zones).district).toBe("Vila Lopes");
    expect(matchDistrict("cacula", "", zones)).toEqual({ district: "Jardim Caçula", city: "Ribeirão Pires" });
    expect(matchDistrict("Vila Lopez", "", zones).district).toBe("Vila Lopes");
  });
  it("pergunta a cidade quando o bairro existe em duas cidades e oferece retirada fora da área", () => {
    expect(() => matchDistrict("Centro", "", zones)).toThrow(/qual cidade: Rio Grande da Serra ou Ribeirão Pires\?/);
    expect(matchDistrict("Centro", "ribeirao pires", zones).city).toBe("Ribeirão Pires");
    expect(() => matchDistrict("Moema", "", zones)).toThrow(/não entregamos.*retirar/);
  });
});

describe("confirmação", () => {
  const pending = { code: "AB12CD34", expires: new Date(Date.now() + 60000).toISOString() } as Pending;
  it("aceita sim natural, botão e código; recusa sim com alteração", () => {
    for (const yes of ["sim", "Pode mandar", "👍", "CONFIRMAR AB12CD34", "fechado, obrigado"]) expect(confirmation(yes, pending)).toBe(true);
    for (const no of ["sim, mas sem cebola", "não", "quanto fica?"]) expect(confirmation(no, pending)).toBe(false);
    expect(affirmative("sim")).toBe(true);
    expect(confirmation("sim", { ...pending, awaiting_receipt: true })).toBe(false);
  });
  it("texto antes da confirmação no mesmo lote gera novo resumo", () => {
    const job = (body: string) => ({ payload: { text: { body } }, order_result: null });
    expect(pickLead([job("sim"), job("valeu")], pending)).toMatchObject({ confirm: true });
    expect(pickLead([job("troca pra broto"), job("sim")], pending)).toMatchObject({ confirm: false });
  });
  it("pergunta depois do resumo invalida o 'sim' antigo", () => {
    expect(pendingAfter({ action: "reply", response: "Quer um pudim?", pending: null }, pending)).toBeNull();
    expect(pendingAfter({ action: "reply", response: "Perfeito!", pending: null }, pending)).toBe(pending);
  });
});

describe("status e telefone", () => {
  it("usa os status da Basso", () => {
    const text = ordersContext([{ number: 900, daily_number: 12, channel: "own_delivery", status: "out_for_delivery", estimated_ready_at: null, created_at: new Date().toISOString(), total_cents: 7500 }]);
    expect(text).toContain("nº 12 (entrega");
    expect(text).toContain("saiu para entrega");
    expect(phoneVariants("5511999998888")).toEqual(expect.arrayContaining(["11999998888", "5511999998888"]));
  });
});

describe("comprovante Pix", () => {
  const account = { pix_key: "62.332.415/0001-10", pix_name: "La Forneria Basso" };
  const read = { is_pix_receipt: true, completed: true, amount_brl: 75, recipient_name: "LA FORNERIA BASSO LTDA", recipient_key: null, paid_at: new Date().toISOString(), bank: "Nubank" };
  it("aceita valor e recebedor corretos e recusa valor diferente", () => {
    expect(judgeReceipt(read, 7500, account).ok).toBe(true);
    expect(judgeReceipt({ ...read, amount_brl: 70 }, 7500, account)).toMatchObject({ ok: false });
    expect(judgeReceipt({ ...read, recipient_name: "Outra Pizzaria" }, 7500, account)).toMatchObject({ ok: false });
  });
});

describe("turno da atendente", () => {
  const context: BotContext = { menu, zones, store: { ...store, city: "Rio Grande da Serra", state: "SP", menuUrl: "https://basso.test", open: true, closedMessage: "", hours: "ter a dom 18h–23h" }, pix: { pix_key: "chave@basso.com", pix_name: "La Forneria Basso" } };
  const quote = vi.fn(async (basket: Parameters<Parameters<typeof assistantTurn>[0]["quote"]>[0]) => {
    const items = basket.items.map((i) => ({ ...i, unitPrice: i.kind === "pizza" ? pizzaTotal(i.selection as PizzaSelection) : [...raw.desserts, ...raw.beverages].find((p) => p.id === i.productId)?.price ?? 0 }));
    const subtotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
    return { quote: { subtotal, discount: 0, deliveryFee: 0, total: subtotal }, basket: { ...basket, items } };
  });
  const ai = (result: object) => vi.fn(async () => ({ action: "reply" as const, reply: "ok", order: null, sendMenu: false, usage: {}, ...result }));

  it("prepara o resumo com massa, adicional por metade e pudim", async () => {
    const order = draft([
      pizza({ flavors: [code("Calabresa Tradicional"), code("Sapori di Parma")], mass: "integral", addons: [{ code: addon("bacon"), qty: 1, half: 1 }] }),
      { ...pizza({}), type: "product", code: catalog.codes.product.get("pudim-frutas-vermelhas")! },
    ]);
    const turn = await assistantTurn({ history: [{ role: "user", content: "pode fechar" }], texts: ["pode fechar"], context, phone: "5511999998888", quote, ai: ai({ action: "prepare", order }) });
    expect(turn.pending).not.toBeNull();
    expect(turn.response).toContain(CONFIRM_LINE);
    expect(turn.response).toContain("½ Calabresa Tradicional + ½ Sapori di Parma");
    expect(turn.response).toContain("Massa integral de longa fermentação");
    expect(turn.response).toContain("+ Bacon (só na metade Calabresa Tradicional)");
    expect(turn.response).toContain("Pudim no Copo Americano - Frutas Vermelhas");
    expect(turn.response).not.toMatch(/borda/i);
  });
  it("loja fechada responde sem chamar a IA; 'atendente' pausa o robô", async () => {
    const spy = ai({});
    const closed = await assistantTurn({ history: [], texts: ["oi"], context: { ...context, store: { ...context.store, open: false } }, phone: "5511", quote, ai: spy });
    expect(closed.action).toBe("closed");
    expect(closed.response).toContain("fechada");
    expect(spy).not.toHaveBeenCalled();
    const human = await assistantTurn({ history: [], texts: ["atendente"], context, phone: "5511", quote, ai: spy });
    expect(human).toMatchObject({ pause: true, response: HUMAN_REPLY });
  });
  it("troco menor que o total vira pergunta ao cliente", async () => {
    const order = draft([pizza({ flavors: [code("Mozzarella")] })], { method: "cash", change_for: 20 });
    const turn = await assistantTurn({ history: [], texts: ["dinheiro"], context, phone: "5511999998888", quote, ai: ai({ action: "prepare", order }) });
    expect(turn.pending).toBeNull();
    expect(turn.response).toMatch(/Troco para quanto\?$/);
  });
  it("pedido de cardápio garante o link", async () => {
    const turn = await assistantTurn({ history: [], texts: ["cardápio"], context, phone: "5511", quote, ai: ai({ reply: "Claro! Aqui está.", sendMenu: true }) });
    expect(turn.response).toContain("https://basso.test");
    expect(turn.menuSent).toBe(true);
  });
  it("resumo mostra entrega e total", () => {
    const basket = resolveDraft(draft([pizza({ flavors: [code("Mozzarella")] })], { kind: "delivery", method: "cash", change_for: 100, address: { street: "Rua A", number: "10", complement: "casa 2", neighborhood: "Vila Lopes", city: "", reference: "" } }), menu, catalog, "5511999998888", zones, { city: "Rio Grande da Serra", state: "SP" });
    basket.items[0].unitPrice = 5000;
    const text = summarize(basket, { subtotal: 5000, discount: 0, deliveryFee: 500, total: 5500 }, namesFor(menu, basket), false);
    expect(text).toContain("🛵 Entrega: Rua A, 10 (casa 2) — Vila Lopes, Rio Grande da Serra");
    expect(text).toContain("troco para R$ 100,00");
    expect(text).toContain("*Total: R$ 55,00*");
  });
});
