"use client";
import Image from "next/image";
import { Heart, Plus } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { currency, uid } from "@/lib/utils";
import type { Product } from "@/types";
import { customerDeviceActions, useCustomerDeviceState } from "@/lib/customer-device-store";

export function ProductCard({ product }: { product: Product }) {
  const cart = useCart();
  const ref = `product:${product.id}`;
  const favorite = useCustomerDeviceState(state => state.favorites.includes(ref));
  return <article className="group surface flex min-h-[150px] overflow-hidden transition hover:-translate-y-0.5 hover:shadow-premium">
    <div className="relative flex min-w-0 flex-1 flex-col p-4"><button type="button" className={`absolute right-3 top-3 rounded-full p-2 ${favorite?"bg-red-50 text-red-600":"bg-black/5 text-black/35"}`} onClick={()=>customerDeviceActions.toggleFavorite(ref)} aria-label={favorite?"Remover dos favoritos":"Adicionar aos favoritos"}><Heart size={16} fill={favorite?"currentColor":"none"}/></button><h3 className="pr-10 font-display text-lg font-bold leading-tight">{product.name}</h3>{product.description && <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-black/55">{product.description}</p>}<div className="mt-auto flex items-end justify-between gap-3 pt-4"><strong className="text-base text-basso-wine">{currency(product.price)}</strong><button className="grid h-10 w-10 place-items-center rounded-full bg-basso-wine text-white shadow-sm transition group-hover:scale-105" aria-label={`Adicionar ${product.name}`} onClick={() => cart.addItem({ id: uid("cart"), kind: "product", name: product.name, quantity: 1, unitPrice: product.price, image: product.image, productId: product.id })}><Plus size={19}/></button></div></div>
    {product.image && <Image src={product.image} alt={product.name} width={160} height={160} className="h-auto w-[128px] object-cover sm:w-[150px]"/>}
  </article>;
}
