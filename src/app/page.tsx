"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronRight, Clock3, Instagram, MapPin, Search, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PublicHeader, DeliveryModeSelector } from "@/components/public/PublicHeader";
import { CartDrawer } from "@/components/public/CartDrawer";
import {
  flavorsForEntry,
  PizzaBuilder,
  PizzaMenuCard,
  type PizzaMenuEntry,
  type PizzaMenuScope,
} from "@/components/public/PizzaBuilder";
import { ComboBuilder } from "@/components/public/ComboBuilder";
import { ProductCard } from "@/components/public/ProductCard";
import { allProducts, catalog, categoryImages } from "@/lib/catalog";
import { currency, normalizeSearchText } from "@/lib/utils";

const categoryNav = [
  ["mais-pedidas", "Mais pedidas"],
  ["tradicionais", "Tradicionais"],
  ["premium", "Premium"],
  ["doces", "Doces"],
  ["combo", "Combo"],
  ["bebidas", "Bebidas"],
  ["sobremesas", "Sobremesas"],
];

const pizzaSections: Array<{
  id: string;
  title: string;
  subtitle: string;
  scope: PizzaMenuScope;
}> = [
  {
    id: "mais-pedidas",
    title: "Mais pedidas",
    subtitle: "Escolha o tamanho e depois selecione entre os sabores em destaque.",
    scope: "featured",
  },
  {
    id: "tradicionais",
    title: "Pizzas Tradicionais",
    subtitle: "42 sabores clássicos. Primeiro escolha Grande ou Broto.",
    scope: "traditional",
  },
  {
    id: "premium",
    title: "Pizzas Premium",
    subtitle: "11 criações especiais. Premium não combina com Tradicional no meio a meio.",
    scope: "premium",
  },
  {
    id: "doces",
    title: "Pizzas Doces",
    subtitle: "11 sabores doces disponíveis nos tamanhos Grande e Broto.",
    scope: "sweet",
  },
];

export default function HomePage() {
  const [mode, setMode] = useState<"delivery" | "pickup">("delivery");
  const [tableNumber, setTableNumber] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [selectedPizza, setSelectedPizza] = useState<PizzaMenuEntry | null>(null);
  const [comboOpen, setComboOpen] = useState(false);

  useEffect(() => {
    const table = Number(new URLSearchParams(window.location.search).get("mesa"));
    if (Number.isInteger(table) && table >= 1 && table <= 15) setTableNumber(table);
  }, []);

  const normalized = normalizeSearchText(query);
  const products = useMemo(
    () =>
      allProducts.filter(
        (product) =>
          !normalized ||
          normalizeSearchText(`${product.name} ${product.description}`).includes(normalized),
      ),
    [normalized],
  );

  const comboMatches = useMemo(
    () =>
      !normalized ||
      normalizeSearchText(`${catalog.combo.name} ${catalog.combo.description}`).includes(normalized),
    [normalized],
  );

  const matchingCount = (entry: PizzaMenuEntry) => {
    const source = flavorsForEntry(entry);
    if (!normalized) return source.length;
    return source.filter((flavor) =>
      normalizeSearchText(`${flavor.name} ${flavor.description}`).includes(normalized),
    ).length;
  };

  const hasPizzaResult = pizzaSections.some((section) =>
    (["grande", "broto"] as const).some(
      (size) => matchingCount({ scope: section.scope, size }) > 0,
    ),
  );

  return (
    <main className="min-h-screen bg-basso-paper">
      <PublicHeader />

      <section className="relative overflow-hidden bg-basso-black text-white">
        <Image
          src="/assets/brand/banner-institucional.png"
          alt="La Forneria Basso"
          fill
          priority
          className="object-cover opacity-55"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/45 to-transparent" />
        <div className="relative mx-auto grid max-w-7xl gap-8 px-4 py-10 md:grid-cols-[1.25fr_.75fr] md:px-6 md:py-16">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/25 px-3 py-1.5 text-xs font-bold text-basso-goldLight">
              <Sparkles size={14} /> Massa de longa fermentação
            </span>
            <h1 className="mt-5 font-display text-4xl font-bold leading-tight sm:text-5xl">
              Pizza artesanal com alma italiana.
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/75 sm:text-base">
              Sabores tradicionais, criações premium e doces preparados para uma experiência acolhedora em Rio Grande da Serra.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 text-xs text-white/70">
              <span className="flex items-center gap-2">
                <Clock3 size={16} className="text-basso-goldLight" /> Terça a domingo, 18h às 23h
              </span>
              <span className="flex items-center gap-2">
                <MapPin size={16} className="text-basso-goldLight" /> Rua do Progresso, 407
              </span>
            </div>
          </div>

          <div className="self-end">
            {tableNumber ? (
              <div className="rounded-2xl border border-basso-gold/35 bg-black/45 p-5 text-center backdrop-blur">
                <p className="text-xs font-black uppercase tracking-[.18em] text-basso-goldLight">
                  Pedido pelo QR Code
                </p>
                <p className="mt-2 font-display text-3xl font-bold">Mesa {tableNumber}</p>
                <p className="mt-2 text-xs leading-relaxed text-white/65">
                  Monte o pedido normalmente. No checkout, identifique sua comanda ou participante. O pagamento continua sob controle da equipe.
                </p>
              </div>
            ) : (
              <>
                <DeliveryModeSelector mode={mode} onChange={setMode} />
                <p className="mt-2 text-center text-xs text-white/55">
                  Taxa e disponibilidade são calculadas no checkout conforme a região configurada.
                </p>
              </>
            )}
          </div>
        </div>
      </section>

      <div className="sticky top-16 z-30 border-b border-black/5 bg-basso-paper/95 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 py-3 md:px-6">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-black/35"
              size={18}
            />
            <input
              className="input h-12 pl-10"
              placeholder="Buscar sabores, bebidas e sobremesas"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <nav className="scrollbar-none mt-3 flex gap-2 overflow-x-auto pb-1">
            {categoryNav.map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                className="chip shrink-0 hover:border-basso-gold hover:text-basso-wine"
              >
                {label}
              </a>
            ))}
          </nav>
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-14 px-4 py-8 md:px-6 md:py-12">
        {!normalized && !tableNumber && (
          <section className="grid gap-4 md:grid-cols-2">
            <ImageCard
              src="/assets/brand/banner-entrega.png"
              title="Entrega"
              text="Peça pelo cardápio próprio e acompanhe o status."
            />
            <ImageCard
              src="/assets/brand/banner-retirada.png"
              title="Retirada"
              text="Faça seu pedido e retire quando estiver pronto."
            />
          </section>
        )}

        {pizzaSections.map((section) => {
          const entries = (["grande", "broto"] as const)
            .map((size) => ({ scope: section.scope, size }))
            .filter((entry) => matchingCount(entry) > 0);

          if (!entries.length) return null;

          return (
            <MenuSection
              key={section.id}
              id={section.id}
              title={section.title}
              subtitle={section.subtitle}
            >
              <div className="grid gap-4 md:grid-cols-2">
                {entries.map((entry) => (
                  <PizzaMenuCard
                    key={`${entry.scope}-${entry.size}`}
                    entry={entry}
                    onOpen={setSelectedPizza}
                    resultCount={normalized ? matchingCount(entry) : undefined}
                  />
                ))}
              </div>
              {section.scope === "sweet" && (
                <div className="mt-4 rounded-2xl border border-basso-gold/30 bg-basso-gold/10 p-4 text-sm">
                  <strong>Base adicional: Creme de Avelã Zero</strong>
                  <span className="ml-2 text-basso-wine">{currency(2500)}</span>
                  <p className="mt-1 text-xs text-black/55">
                    Opção indicada no cardápio para pessoas com restrições alimentares e para quem faz dieta.
                  </p>
                </div>
              )}
            </MenuSection>
          );
        })}

        {comboMatches && (
          <MenuSection
            id="combo"
            title="Combo oficial"
            subtitle="Uma configuração completa pelo valor oficial."
          >
            <article className="surface grid overflow-hidden md:grid-cols-[360px_1fr]">
              <div className="relative min-h-64">
                <Image src={categoryImages.combo} alt={catalog.combo.name} fill className="object-cover" />
              </div>
              <div className="flex flex-col justify-center p-6 md:p-8">
                <p className="text-xs font-black uppercase tracking-[.18em] text-basso-gold">Combo</p>
                <h3 className="mt-2 font-display text-3xl font-bold">{catalog.combo.name}</h3>
                <p className="mt-3 text-sm leading-relaxed text-black/55">{catalog.combo.description}</p>
                <div className="mt-6 flex items-center justify-between gap-4">
                  <strong className="text-2xl text-basso-wine">{currency(catalog.combo.price)}</strong>
                  <button className="btn-primary" onClick={() => setComboOpen(true)}>
                    Configurar <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            </article>
          </MenuSection>
        )}

        {products.some((product) => product.category === "beverages") && (
          <MenuSection
            id="bebidas"
            title="Bebidas"
            subtitle="29 produtos. O estoque é controlado somente para bebidas e sobremesas."
          >
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {products
                .filter((product) => product.category === "beverages")
                .map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
            </div>
          </MenuSection>
        )}

        {products.some((product) => product.category === "desserts") && (
          <MenuSection
            id="sobremesas"
            title="Sobremesas"
            subtitle="Pudim no Copo Americano, 180 ml."
          >
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {products
                .filter((product) => product.category === "desserts")
                .map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
            </div>
          </MenuSection>
        )}

        {normalized && !hasPizzaResult && products.length === 0 && !comboMatches && (
          <div className="surface p-10 text-center">
            <p className="font-display text-2xl font-bold">Nenhum item encontrado</p>
            <p className="mt-2 text-sm text-black/50">Tente buscar por outro nome ou ingrediente.</p>
          </div>
        )}
      </div>

      <footer className="border-t border-white/10 bg-basso-black text-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 md:grid-cols-3 md:px-6">
          <div>
            <Image
              src="/assets/brand/logo.png"
              alt=""
              width={72}
              height={72}
              className="rounded-full"
            />
            <p className="mt-3 font-display text-xl font-bold">La Forneria Basso</p>
            <p className="mt-2 text-sm text-white/55">Pizzaria artesanal • massa de longa fermentação.</p>
          </div>
          <div>
            <p className="font-bold">Contato</p>
            <p className="mt-3 text-sm text-white/60">(11) 97235-6751</p>
            <p className="mt-1 text-sm text-white/60">
              Rua do Progresso, 407, Centro, Rio Grande da Serra/SP
            </p>
            <a
              href="https://instagram.com/laforneriabasso"
              className="mt-3 inline-flex items-center gap-2 text-sm text-basso-goldLight"
            >
              <Instagram size={16} /> @laforneriabasso
            </a>
          </div>
          <div>
            <p className="font-bold">Informações</p>
            <div className="mt-3 flex flex-col gap-2 text-sm text-white/60">
              <Link href="/privacidade">Política de privacidade</Link>
              <Link href="/termos">Termos de uso</Link>
              <Link href="/login">Acesso da equipe</Link>
            </div>
          </div>
        </div>
      </footer>

      <PizzaBuilder
        entry={selectedPizza}
        open={Boolean(selectedPizza)}
        onClose={() => setSelectedPizza(null)}
      />
      <ComboBuilder open={comboOpen} onClose={() => setComboOpen(false)} />
      <CartDrawer />
    </main>
  );
}

function MenuSection({
  id,
  title,
  subtitle,
  children,
}: {
  id: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-44">
      <div className="mb-5">
        <h2 className="font-display text-3xl font-bold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm text-black/50">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function ImageCard({ src, title, text }: { src: string; title: string; text: string }) {
  return (
    <div className="relative min-h-52 overflow-hidden rounded-3xl bg-basso-black text-white">
      <Image src={src} alt={title} fill className="object-cover opacity-65" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />
      <div className="absolute bottom-0 p-5">
        <p className="font-display text-2xl font-bold">{title}</p>
        <p className="mt-1 text-sm text-white/70">{text}</p>
      </div>
    </div>
  );
}
