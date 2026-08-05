import raw from "@/data/catalog.json";
import type { Addon, Flavor, Product } from "@/types";

export const catalog = raw as unknown as Omit<typeof raw, "flavors" | "addons" | "beverages" | "desserts"> & {
  flavors: Flavor[];
  addons: Addon[];
  beverages: Product[];
  desserts: Product[];
};

const productImages: Record<string, string> = {
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
  "pudim-frutas-vermelhas": "/assets/products/sobremesa-perfeita-para-completar-a-sua-experiencia-pudim-no-copo-americano.png"
};

export const categoryImages = {
  traditional: {
    grande: "/assets/products/pizzas-tradicionais-pizza-grande.jpeg",
    broto: "/assets/products/pizzas-tradicionais-pizza-broto.jpeg"
  },
  premium: {
    grande: "/assets/products/pizzas-premium-pizza-grande.png",
    broto: "/assets/products/pizzas-premium-pizza-broto.jpeg"
  },
  sweet: {
    grande: "/assets/products/pizzas-doces-pizza-grande.jpeg",
    broto: "/assets/products/pizzas-doces-pizza-broto.jpeg"
  },
  featured: {
    grande: "/assets/products/as-mais-pedidas-pizza-grande.png",
    broto: "/assets/products/as-mais-pedidas-pizza-broto.jpeg"
  },
  combo: "/assets/products/combo-r-79-99-pizza-grande-broto-doce-refrigerante-2-litros.png"
} as const;

export const allProducts: Product[] = [...catalog.beverages, ...catalog.desserts].map(p => ({ ...p, image: productImages[p.id] }));
export const findFlavor = (id: string) => catalog.flavors.find(f => f.id === id);
export const findAddon = (id: string) => catalog.addons.find(a => a.id === id);
export const findProduct = (id: string) => allProducts.find(p => p.id === id);
export const flavorImage = (flavor: Flavor, size: "grande" | "broto" = "grande") => categoryImages[flavor.category][size];
export const minimumFlavorPrice = (category: Flavor["category"], size: "grande" | "broto" = "grande") => Math.min(...catalog.flavors.filter(f => f.category === category).map(f => size === "grande" ? f.priceGrande : f.priceBroto));
