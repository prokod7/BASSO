"use client";
import { useMemo, useState } from "react";
import { Minus, Plus, ShieldCheck } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { catalog, findFlavor } from "@/lib/catalog";
import { addonPrice, validatePizzaSelection } from "@/lib/pricing";
import { currency, uid } from "@/lib/utils";
import type { CartItem, PizzaSelection } from "@/types";

export interface RewardAuthorizationData {
  token: string;
  authorizationId: string;
  flavorId: "mozzarella" | "calabresa-tradicional";
  expiresAt: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
}

export function RewardBuilder({ authorization, open, onClose, onAdd }: { authorization: RewardAuthorizationData | null; open: boolean; onClose: () => void; onAdd: (item: CartItem) => void }) {
  const [mass, setMass] = useState<PizzaSelection["mass"]>("traditional");
  const [removed, setRemoved] = useState<string[]>([]);
  const [addons, setAddons] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const flavor = authorization ? findFlavor(authorization.flavorId) : undefined;
  const total = useMemo(() => { try { return addonPrice(addons); } catch { return 0; } }, [addons]);
  if (!authorization || !flavor) return null;
  const selection: PizzaSelection = { size: "grande", mass, flavorA: flavor.id, removedA: removed, removedB: [], addons, notes };
  const setAddon = (id: string, delta: number) => setAddons(current => {
    const currentQuantity = current[id] || 0;
    const next = Math.max(0, Math.min(2, currentQuantity + delta));
    const totalWithout = Object.entries(current).filter(([key]) => key !== id).reduce((sum, [, quantity]) => sum + quantity, 0);
    if (totalWithout + next > 5) return current;
    return { ...current, [id]: next };
  });
  const add = () => {
    try {
      validatePizzaSelection(selection);
      onAdd({ id: uid("reward"), kind: "reward", name: `Recompensa • Pizza Grande ${flavor.name}`, quantity: 1, unitPrice: addonPrice(addons), selection });
      onClose();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Configuração inválida."); }
  };
  return <Modal open={open} onClose={onClose} title="Configurar recompensa" className="sm:max-w-2xl"><div className="space-y-5 p-5"><div className="rounded-2xl bg-basso-black p-4 text-white"><p className="flex items-center gap-2 text-sm font-bold"><ShieldCheck className="text-basso-goldLight" size={18}/>Autorização interna válida</p><p className="mt-1 text-xs text-white/60">{authorization.customerName} • {flavor.name} Grande • base R$ 0,00</p></div><section><p className="label">Massa</p><div className="grid grid-cols-2 gap-2"><button className={`rounded-xl border p-3 text-sm font-bold ${mass==="traditional"?"border-basso-wine bg-basso-wine/5":"border-black/10"}`} onClick={()=>setMass("traditional")}>Tradicional</button><button className={`rounded-xl border p-3 text-sm font-bold ${mass==="integral"?"border-basso-wine bg-basso-wine/5":"border-black/10"}`} onClick={()=>setMass("integral")}>Integral</button></div></section><section><p className="label">Retirar ingredientes</p><div className="flex flex-wrap gap-2">{flavor.ingredients.map(ingredient=><button key={ingredient} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${removed.includes(ingredient)?"border-red-300 bg-red-50 text-red-700 line-through":"border-black/10 bg-basso-paper"}`} onClick={()=>setRemoved(current=>current.includes(ingredient)?current.filter(item=>item!==ingredient):[...current,ingredient])}>{ingredient}</button>)}</div></section><section><div className="flex justify-between"><p className="label">Adicionais cobrados normalmente</p><span className="text-xs text-black/40">Máx. 5 unidades</span></div><div className="divide-y divide-black/5 rounded-xl border border-black/10">{catalog.addons.map(addon=>{const quantity=addons[addon.id]||0;return <div key={addon.id} className="flex items-center justify-between p-3"><div><strong className="text-sm">{addon.name}</strong><p className="text-xs text-basso-wine">{currency(addon.price)}</p></div><div className="flex items-center rounded-lg border"><button className="p-2" disabled={!quantity} onClick={()=>setAddon(addon.id,-1)}><Minus size={14}/></button><strong className="w-7 text-center text-xs">{quantity}</strong><button className="p-2" disabled={quantity>=2||Object.values(addons).reduce((sum,value)=>sum+value,0)>=5} onClick={()=>setAddon(addon.id,1)}><Plus size={14}/></button></div></div>})}</div></section><label><span className="label">Observações</span><textarea className="textarea" maxLength={500} value={notes} onChange={event=>setNotes(event.target.value)}/></label>{error&&<p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}<button className="btn-primary w-full" onClick={add}>Adicionar recompensa • {currency(total)}</button></div></Modal>;
}
