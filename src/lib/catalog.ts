import raw from "@/data/catalog.json";
import type { Addon, Flavor, Product } from "@/types";

type BaseCatalog = Omit<typeof raw, "flavors" | "addons" | "beverages" | "desserts"> & {
  flavors: Flavor[];
  addons: Addon[];
  beverages: Product[];
  desserts: Product[];
};

const source = raw as unknown as BaseCatalog;
const beverages = source.beverages
  .filter((item) => item.id !== "suco-del-valle-lata-290-ml")
  .map((item) => item.id === "agua-tonica-schweppes-lata-350-ml" ? { ...item, active: false } : item);
const delValle: Product[] = [
  { id: "suco-del-valle-uva-lata-290-ml", name: "Suco Del Valle Uva lata 290 ml", description: "Suco Del Valle sabor Uva, lata 290 ml.", price: 700, active: true, stockTracked: false, category: "beverages" },
  { id: "suco-del-valle-pessego-lata-290-ml", name: "Suco Del Valle Pêssego lata 290 ml", description: "Suco Del Valle sabor Pêssego, lata 290 ml.", price: 700, active: true, stockTracked: false, category: "beverages" },
  { id: "suco-del-valle-goiaba-lata-290-ml", name: "Suco Del Valle Goiaba lata 290 ml", description: "Suco Del Valle sabor Goiaba, lata 290 ml.", price: 700, active: true, stockTracked: false, category: "beverages" },
  { id: "suco-del-valle-maracuja-lata-290-ml", name: "Suco Del Valle Maracujá lata 290 ml", description: "Suco Del Valle sabor Maracujá, lata 290 ml.", price: 700, active: true, stockTracked: false, category: "beverages" },
];
const flavors: Flavor[] = source.flavors.map((flavor) => flavor.id === "salame" ? {
  ...flavor,
  ingredients: flavor.ingredients.filter((ingredient) => ingredient.toLocaleLowerCase("pt-BR") !== "salsa"),
  description: "Massa de longa fermentação, passata di pomodoro, mozzarella, salame e azeitonas pretas.",
} : flavor);
const combo = {
  ...source.combo,
  options: {
    ...source.combo.options,
    // A promoção oficial aceita somente Calabresa Tradicional e Mozzarella.
    // Mantemos os IDs do catálogo mestre; não ampliar para todos os sabores ativos.
    grandeFlavors: [...source.combo.options.grandeFlavors],
    masses: ["traditional", "integral"],
    allowHalfHalf: true,
    allowAddonPlacement: true,
  },
};
export const catalog: BaseCatalog = { ...source, flavors: flavors.sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })), beverages: [...beverages, ...delValle], combo };

export const productImages: Record<string, string> = {
  "agua-tonica-fys-lata-350-ml": "/assets/products/agua-tonica-fys-lata-350ml.jpg",
  "agua-tonica-schweppes-lata-350-ml": "/assets/products/agua-tonica-schweppes-lata-350ml.jpg",
  "h2oh-limoneto-500-ml": "/assets/products/h2oh-limoneto-500ml.jpg",
  "h2oh-limao-500-ml": "/assets/products/h2oh-limao-500ml.webp",
  "coca-cola-lata-350-ml": "/assets/products/coca-cola-lata-350ml.webp",
  "coca-cola-zero-lata-350-ml": "/assets/products/coca-cola-zero-lata-350ml.webp",
  "guarana-antarctica-lata-350-ml": "/assets/products/guarana-antarctica-lata-350ml.webp",
  "guarana-antarctica-zero-lata-350-ml": "/assets/products/guarana-antarctica-zero-lata-350ml.webp",
  "fanta-laranja-lata-350-ml": "/assets/products/fanta-laranja-lata-350ml.webp",
  "fanta-uva-lata-350-ml": "/assets/products/fanta-uva-lata-350ml.webp",
  "suco-del-valle-lata-290-ml": "/assets/products/sucos-del-valle-290ml-lata.jpg",
  "suco-del-valle-uva-lata-290-ml": "/assets/products/sucos-del-valle-290ml-lata.jpg",
  "suco-del-valle-pessego-lata-290-ml": "/assets/products/sucos-del-valle-290ml-lata.jpg",
  "suco-del-valle-goiaba-lata-290-ml": "/assets/products/sucos-del-valle-290ml-lata.jpg",
  "suco-del-valle-maracuja-lata-290-ml": "/assets/products/sucos-del-valle-290ml-lata.jpg",
  "original-long-neck-300-ml": "/assets/products/original-300-ml-long-neck.jpg",
  "itubaina-lata-350-ml": "/assets/products/itubaina-lata-350ml.webp",
  "coca-cola-1-l": "/assets/products/coca-cola-1l.webp",
  "coca-cola-zero-1-l": "/assets/products/coca-cola-1l-zero.webp",
  "coca-cola-2-l": "/assets/products/coca-cola-2l.webp",
  "coca-cola-zero-2-l": "/assets/products/coca-cola-zero-2l.jpg",
  "fanta-laranja-2-l": "/assets/products/fanta-laranja-2l.webp",
  "fanta-uva-2-l": "/assets/products/fanta-uva-2l.webp",
  "guarana-antarctica-2-l": "/assets/products/guarana-antarctica-2l.jpg",
  "guarana-antarctica-zero-2-l": "/assets/products/guarana-antarctica-zero-2l.webp",
  "sprite-2-l": "/assets/products/sprite-2l.webp",
  "sprite-zero-2-l": "/assets/products/sprite-2l-zero.png",
  "pudim-tradicional": "/assets/products/sobremesa-perfeita-para-completar-a-sua-experiencia-pudim-no-copo-americano.png",
  "pudim-frutas-vermelhas": "/assets/products/sobremesa-perfeita-para-completar-a-sua-experiencia-pudim-no-copo-americano.png",
  "combo-grande-broto-refri": "/assets/products/combo-r-79-99-pizza-grande-broto-doce-refrigerante-2-litros.png",
};

type PizzaImageScope = "traditional" | "premium" | "sweet" | "featured";
type PizzaImageSize = "grande" | "broto";
export const defaultCategoryImages = {
  traditional: { grande: "/assets/products/pizzas-tradicionais-pizza-grande.jpeg", broto: "/assets/products/pizzas-tradicionais-pizza-broto.jpeg" },
  premium: { grande: "/assets/products/pizzas-premium-pizza-grande.png", broto: "/assets/products/pizzas-premium-pizza-broto.jpeg" },
  sweet: { grande: "/assets/products/pizzas-doces-pizza-grande.jpeg", broto: "/assets/products/pizzas-doces-pizza-broto.jpeg" },
  featured: { grande: "/assets/products/as-mais-pedidas-pizza-grande.png", broto: "/assets/products/as-mais-pedidas-pizza-broto.jpeg" },
  combo: "/assets/products/combo-r-79-99-pizza-grande-broto-doce-refrigerante-2-litros.png",
} as const;
/** Fotos em uso no cardápio; o painel pode substituir cada uma (Configurações → Fotos do cardápio). */
export const categoryImages: { [K in PizzaImageScope]: Record<PizzaImageSize, string> } & { combo: string } = {
  traditional: { ...defaultCategoryImages.traditional },
  premium: { ...defaultCategoryImages.premium },
  sweet: { ...defaultCategoryImages.sweet },
  featured: { ...defaultCategoryImages.featured },
  combo: defaultCategoryImages.combo,
};
/** Aplica as fotos personalizadas (chaves "traditional.grande" etc.); ausentes voltam ao padrão. */
export function applySiteImages(images: Record<string, string> | undefined | null) {
  for (const scope of ["traditional", "premium", "sweet", "featured"] as const) {
    for (const size of ["grande", "broto"] as const) {
      categoryImages[scope][size] = images?.[`${scope}.${size}`] || defaultCategoryImages[scope][size];
    }
  }
}

export const allProducts: Product[] = [...catalog.beverages, ...catalog.desserts]
  .filter((product) => product.active)
  .map((product) => ({ ...product, image: productImages[product.id] }));
export const findFlavor = (id: string) => catalog.flavors.find((flavor) => flavor.id === id);
export const findAddon = (id: string) => catalog.addons.find((addon) => addon.id === id);
export const findProduct = (id: string) => allProducts.find((product) => product.id === id);
export const flavorImage = (flavor: Flavor, size: "grande" | "broto" = "grande") => categoryImages[flavor.category][size];
export const minimumFlavorPrice = (category: Flavor["category"], size: "grande" | "broto" = "grande") => Math.min(...catalog.flavors.filter((flavor) => flavor.category === category).map((flavor) => size === "grande" ? flavor.priceGrande : flavor.priceBroto));
