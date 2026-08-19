"use client";

import Image from "next/image";
import Link from "next/link";
import { Copy, Minus, Pencil, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useCart } from "@/context/CartContext";
import { catalog, findFlavor } from "@/lib/catalog";
import { PizzaBuilder } from "@/components/public/PizzaBuilder";
import { currency } from "@/lib/utils";
import type { CartItem, PizzaSelection } from "@/types";

export function CartDrawer() {
  const cart = useCart();
  const [checkoutHref, setCheckoutHref] = useState("/checkout");
  const [editing, setEditing] = useState<CartItem | null>(null);

  useEffect(() => {
    const table = Number(new URLSearchParams(window.location.search).get("mesa"));
    setCheckoutHref(Number.isInteger(table) && table >= 1 && table <= 15 ? `/checkout?mesa=${table}` : "/checkout");
  }, []);

  if (!cart.open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm"
      onMouseDown={(event) => event.target === event.currentTarget && cart.setOpen(false)}
      role="presentation"
    >
      <aside className="safe-bottom absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-basso-paper shadow-2xl" aria-label="Carrinho de compras">
        <header className="flex items-center justify-between border-b border-black/5 px-5 py-4">
          <div>
            <h2 className="font-display text-2xl font-bold">Seu carrinho</h2>
            <p className="text-xs text-black/50">{cart.count} {cart.count === 1 ? "item" : "itens"} • salvo neste dispositivo</p>
          </div>
          <button className="btn-ghost" onClick={() => cart.setOpen(false)} aria-label="Fechar carrinho"><X /></button>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {cart.items.length === 0 ? (
            <div className="grid h-full place-items-center text-center">
              <div>
                <ShoppingBag size={40} className="mx-auto text-black/20" />
                <p className="mt-4 font-bold">Seu carrinho está vazio</p>
                <p className="mt-1 text-sm text-black/50">Escolha uma pizza, bebida ou sobremesa do cardápio.</p>
                <button className="btn-secondary mt-4" onClick={() => cart.setOpen(false)}>Voltar ao cardápio</button>
              </div>
            </div>
          ) : cart.items.map((item) => (
            <article key={item.id} className="surface flex gap-3 p-3">
              {item.image ? (
                <Image src={item.image} alt="" width={80} height={80} className="h-20 w-20 shrink-0 rounded-xl object-cover" />
              ) : (
                <div className="grid h-20 w-20 shrink-0 place-items-center rounded-xl bg-black/[.04]"><ShoppingBag size={20} className="text-black/25" /></div>
              )}
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-bold">{item.name}</p>
                <CartItemDetails item={item} />
                <div className="mt-2 flex items-end justify-between gap-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-black/35">Subtotal</p>
                    <p className="text-sm font-black text-basso-wine">{currency(item.unitPrice * item.quantity)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {isPizzaSelection(item.selection) && <button className="grid h-9 w-9 place-items-center rounded-lg border border-black/10 bg-white" onClick={() => setEditing(item)} aria-label={`Editar ${item.name}`} title="Editar pizza"><Pencil size={15} /></button>}
                    <button className="grid h-9 w-9 place-items-center rounded-lg border border-black/10 bg-white" onClick={() => cart.duplicateItem(item.id)} aria-label={`Duplicar ${item.name}`} title="Duplicar item"><Copy size={15} /></button>
                    <div className="flex h-9 items-center rounded-lg border border-black/10 bg-white">
                      <button className="grid h-9 w-9 place-items-center" onClick={() => cart.updateQuantity(item.id, item.quantity - 1)} aria-label={`Diminuir quantidade de ${item.name}`}><Minus size={15} /></button>
                      <span className="min-w-7 text-center text-xs font-bold">{item.quantity}</span>
                      <button className="grid h-9 w-9 place-items-center" onClick={() => cart.updateQuantity(item.id, item.quantity + 1)} aria-label={`Aumentar quantidade de ${item.name}`}><Plus size={15} /></button>
                    </div>
                    <button className="grid h-9 w-9 place-items-center rounded-lg text-red-600 hover:bg-red-50" onClick={() => cart.removeItem(item.id)} aria-label={`Remover ${item.name}`}><Trash2 size={17} /></button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>

        {cart.items.length > 0 && (
          <footer className="border-t border-black/5 bg-white p-4 shadow-[0_-12px_30px_rgba(0,0,0,.04)]">
            <div className="mb-3 flex items-center justify-between">
              <div><p className="text-xs text-black/45">Subtotal do carrinho</p><p className="text-[11px] text-black/35">Taxa e descontos são confirmados no checkout.</p></div>
              <strong className="text-xl">{currency(cart.subtotal)}</strong>
            </div>
            <Link href={checkoutHref} onClick={() => cart.setOpen(false)} className="btn-primary min-h-12 w-full">Continuar para o checkout • {currency(cart.subtotal)}</Link>
            <button
              type="button"
              className="mt-2 w-full py-2 text-xs font-bold text-black/40 hover:text-red-600"
              onClick={() => { if (window.confirm("Limpar todos os itens do carrinho?")) cart.clear(); }}
            >
              Limpar carrinho
            </button>
          </footer>
        )}
      </aside>
      {editing && isPizzaSelection(editing.selection) && (
        <PizzaBuilder
          flavor={findFlavor(editing.selection.flavorA) || null}
          open
          initialSelection={editing.selection}
          onClose={() => setEditing(null)}
          onAdd={(updated) => {
            cart.replaceItem(editing.id, { ...updated, id: editing.id, quantity: editing.quantity });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function isPizzaSelection(selection: CartItem["selection"]): selection is PizzaSelection {
  return Boolean(selection && "size" in selection && "flavorA" in selection);
}

function CartItemDetails({ item }: { item: CartItem }) {
  if (!isPizzaSelection(item.selection)) return null;
  const selection = item.selection;
  const first = findFlavor(selection.flavorA);
  const second = selection.flavorB ? findFlavor(selection.flavorB) : undefined;
  const addons = Object.entries(selection.addons)
    .filter(([, quantity]) => quantity > 0)
    .map(([id, quantity]) => `${quantity}× ${catalog.addons.find((addon) => addon.id === id)?.name || id}`);
  const removals = [
    ...selection.removedA.map((name) => `sem ${name}${first ? ` (${first.name})` : ""}`),
    ...selection.removedB.map((name) => `sem ${name}${second ? ` (${second.name})` : ""}`),
  ];

  return (
    <div className="mt-1 space-y-0.5 text-[11px] leading-relaxed text-black/48">
      <p>{selection.size === "grande" ? "Grande" : "Broto"} • {first?.name || selection.flavorA}{second ? ` + ${second.name}` : ""}</p>
      {addons.length > 0 && <p className="text-emerald-700">+ {addons.join(" • ")}</p>}
      {removals.length > 0 && <p className="text-red-700">{removals.join(" • ")}</p>}
      {selection.notes && <p className="line-clamp-2 italic">Obs.: {selection.notes}</p>}
    </div>
  );
}
