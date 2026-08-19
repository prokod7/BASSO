"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { CartItem } from "@/types";
import { cartSubtotal } from "@/lib/pricing";
import { uid } from "@/lib/utils";

interface CartContextValue {
  items: CartItem[];
  count: number;
  subtotal: number;
  addItem: (item: CartItem) => void;
  updateQuantity: (id: string, quantity: number) => void;
  removeItem: (id: string) => void;
  duplicateItem: (id: string) => void;
  replaceItem: (id: string, item: CartItem) => void;
  clear: () => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}
const CartContext = createContext<CartContextValue | null>(null);
const KEY = "lfb-cart-v31";
export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    try { setItems(JSON.parse(localStorage.getItem(KEY) || "[]")); } catch { setItems([]); }
    setHydrated(true);
  }, []);
  useEffect(() => { if (hydrated) localStorage.setItem(KEY, JSON.stringify(items)); }, [items, hydrated]);
  const addItem = useCallback((item: CartItem) => { setItems(current => [...current, item]); setOpen(true); }, []);
  const updateQuantity = useCallback((id: string, quantity: number) => setItems(current => quantity <= 0 ? current.filter(i => i.id !== id) : current.map(i => i.id === id ? { ...i, quantity } : i)), []);
  const removeItem = useCallback((id: string) => setItems(current => current.filter(i => i.id !== id)), []);
  const duplicateItem = useCallback((id: string) => setItems(current => { const source = current.find(i => i.id === id); return source ? [...current, { ...source, id: uid("cart") }] : current; }), []);
  const replaceItem = useCallback((id: string, item: CartItem) => setItems(current => current.map(existing => existing.id === id ? { ...item, id } : existing)), []);
  const clear = useCallback(() => setItems([]), []);
  const value = useMemo(() => ({ items, count: items.reduce((s, i) => s + i.quantity, 0), subtotal: cartSubtotal(items), addItem, updateQuantity, removeItem, duplicateItem, replaceItem, clear, open, setOpen }), [items, addItem, updateQuantity, removeItem, duplicateItem, replaceItem, clear, open]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
