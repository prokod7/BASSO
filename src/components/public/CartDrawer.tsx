"use client";
import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { useEffect, useState } from "react";
import { currency } from "@/lib/utils";

export function CartDrawer() {
  const cart = useCart();
  const [checkoutHref, setCheckoutHref] = useState("/checkout");
  useEffect(() => {
    const table = Number(new URLSearchParams(window.location.search).get("mesa"));
    setCheckoutHref(Number.isInteger(table) && table >= 1 && table <= 15 ? `/checkout?mesa=${table}` : "/checkout");
  }, []);
  if (!cart.open) return null;
  return <div className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm" onMouseDown={e => e.target === e.currentTarget && cart.setOpen(false)}>
    <aside className="safe-bottom absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-basso-paper shadow-2xl">
      <div className="flex items-center justify-between border-b border-black/5 px-5 py-4"><div><h2 className="font-display text-2xl font-bold">Seu carrinho</h2><p className="text-xs text-black/50">{cart.count} {cart.count === 1 ? "item" : "itens"}</p></div><button className="btn-ghost" onClick={() => cart.setOpen(false)}><X/></button></div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {cart.items.length === 0 ? <div className="grid h-full place-items-center text-center"><div><ShoppingBag size={40} className="mx-auto text-black/20"/><p className="mt-4 font-bold">Seu carrinho está vazio</p><p className="mt-1 text-sm text-black/50">Escolha uma pizza ou outro produto do cardápio.</p></div></div> : cart.items.map(item => <div key={item.id} className="surface flex gap-3 p-3">
          {item.image && <Image src={item.image} alt="" width={72} height={72} className="h-[72px] w-[72px] rounded-xl object-cover"/>}
          <div className="min-w-0 flex-1"><p className="line-clamp-2 text-sm font-bold">{item.name}</p><p className="mt-1 text-sm font-black text-basso-wine">{currency(item.unitPrice * item.quantity)}</p><div className="mt-2 flex items-center justify-between"><div className="flex items-center rounded-lg border border-black/10"><button className="p-1.5" onClick={() => cart.updateQuantity(item.id, item.quantity - 1)}><Minus size={15}/></button><span className="min-w-7 text-center text-xs font-bold">{item.quantity}</span><button className="p-1.5" onClick={() => cart.updateQuantity(item.id, item.quantity + 1)}><Plus size={15}/></button></div><button className="p-2 text-red-600" onClick={() => cart.removeItem(item.id)}><Trash2 size={17}/></button></div></div>
        </div>)}
      </div>
      {cart.items.length > 0 && <div className="border-t border-black/5 bg-white p-4"><div className="mb-4 flex items-center justify-between"><span className="text-sm text-black/55">Subtotal</span><strong className="text-xl">{currency(cart.subtotal)}</strong></div><Link href={checkoutHref} onClick={() => cart.setOpen(false)} className="btn-primary w-full">Ir para o checkout</Link></div>}
    </aside>
  </div>;
}
