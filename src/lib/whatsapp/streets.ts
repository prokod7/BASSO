import { normalizeSearchText } from "@/lib/utils";
import { DISTRICT_ALIASES, STREET_DISTRICTS } from "./streets-data";

export type KnownStreet = { street: string; district: string; city: string; uses?: number };

const base = (value: string) => normalizeSearchText(value).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** Abreviações comuns de endereço (rua e bairro), como o cliente escreve no WhatsApp. */
const ABBREVIATIONS: Record<string, string> = {
  r: "rua", av: "avenida", avd: "avenida", aven: "avenida", al: "alameda", estr: "estrada", rod: "rodovia",
  trav: "travessa", tv: "travessa", tr: "travessa", pca: "praca", pc: "praca", lgo: "largo", lg: "largo",
  pref: "prefeito", dr: "doutor", dra: "doutora", cap: "capitao", prof: "professor", profa: "professora",
  ver: "vereador", dep: "deputado", pres: "presidente", gov: "governador", eng: "engenheiro", cel: "coronel",
  gal: "general", gen: "general", mal: "marechal", sen: "senador", pe: "padre", fr: "frei", vsc: "visconde",
  sta: "santa", sto: "santo", sra: "senhora", nsa: "nossa", ns: "nossa senhora", n: "nossa",
  jd: "jardim", jdm: "jardim", jardins: "jardim", vl: "vila", v: "vila", pq: "parque", pque: "parque", prq: "parque",
  ch: "chacara", chac: "chacara", rec: "recanto", res: "residencial", resid: "residencial", cj: "conjunto",
  conj: "conjunto", nuc: "nucleo", lot: "loteamento", sit: "sitio", faz: "fazenda", est: "estancia",
};

/** Normaliza e expande abreviações: "R. Pref. Cido Franco" → "rua prefeito cido franco". */
export function expandAddress(value: string) {
  return base(value).split(" ").map((word) => ABBREVIATIONS[word] ?? word).join(" ").replace(/\bnossa nossa senhora\b/g, "nossa senhora");
}

const STREET_TYPES = /^(rua|avenida|alameda|estrada|rodovia|travessa|praca|largo|passagem|caminho|viela|via)\s+/;
const FILLERS = /\b(de|da|do|das|dos|e)\b/g;

/** Chave de comparação de rua: sem tipo (Rua/Av.), sem "de/da/do", abreviações expandidas. */
export function streetKey(value: string) {
  return expandAddress(value).replace(STREET_TYPES, "").replace(FILLERS, " ").replace(/\s+/g, " ").trim();
}

/** Bairro escrito pelo cliente com abreviação/nome curto → nome por extenso (ou oficial). */
export function expandDistrict(value: string) {
  const expanded = expandAddress(value);
  const alias = DISTRICT_ALIASES.find(([key]) => expanded === key || expanded.replace(/^(jardim|vila|parque|chacara|recanto|estancia|residencial|conjunto)\s+/, "") === key);
  return alias ? alias[1] : expanded;
}

const STATIC: KnownStreet[] = STREET_DISTRICTS.map(([street, district, city]) => ({ street, district, city }));

/**
 * Descobre o bairro pela rua. Primeiro o que a própria Basso já entregou (endereços de pedidos e
 * clientes, o mais frequente), depois o diretório de ruas. Só responde quando não há dúvida.
 */
export function districtForStreet(street: string, cityHint: string, learned: KnownStreet[] = []): KnownStreet | null {
  const key = streetKey(street);
  if (key.length < 3) return null;
  const city = base(cityHint);
  const pick = (list: KnownStreet[]) => {
    const exact = list.filter((s) => streetKey(s.street) === key && (!city || base(s.city) === city || !s.city));
    if (!exact.length) return null;
    // Aprendidos: o bairro mais usado nessa rua; diretório: só se houver um bairro.
    const byDistrict = new Map<string, KnownStreet & { uses: number }>();
    for (const s of exact) {
      const id = `${base(s.district)}|${base(s.city)}`;
      const current = byDistrict.get(id);
      byDistrict.set(id, { ...s, uses: (current?.uses ?? 0) + (s.uses ?? 1) });
    }
    const ranked = [...byDistrict.values()].sort((a, b) => b.uses - a.uses);
    if (ranked.length === 1) return ranked[0];
    return ranked[0].uses >= 2 * ranked[1].uses ? ranked[0] : null;
  };
  return pick(learned) ?? pick(STATIC);
}
