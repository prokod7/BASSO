"use client";

import { History, MapPin, UserRound } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

export type SavedCustomer = {
  name?: string;
  address?: { street?: string; number?: string; district?: string; city?: string; complement?: string; reference?: string } | null;
  lastOrderAt?: string;
  lastOrderNumber?: number | string;
};

/** "Usar os dados do último pedido?" ao digitar um telefone já conhecido. */
export function SavedCustomerPrompt({ saved, onUse, onSkip }: { saved: SavedCustomer | null; onUse: () => void; onSkip: () => void }) {
  const address = saved?.address;
  const addressText = address?.street ? `${address.street}${address.number ? `, ${address.number}` : ""}${address.district ? ` — ${address.district}` : ""}${address.complement ? ` (${address.complement})` : ""}` : "";
  const when = saved?.lastOrderAt ? new Date(saved.lastOrderAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";
  return <Modal open={Boolean(saved)} onClose={onSkip} title="Usar os dados do último pedido?">
    <div className="space-y-3 p-5">
      {saved?.name && <p className="flex items-center gap-2 text-sm"><UserRound size={17} className="text-basso-wine" /><strong>{saved.name}</strong></p>}
      {addressText && <p className="flex items-start gap-2 text-sm"><MapPin size={17} className="mt-0.5 shrink-0 text-basso-wine" /><span>{addressText}</span></p>}
      {when && <p className="flex items-center gap-2 text-xs text-black/50"><History size={15} />Último pedido{saved?.lastOrderNumber ? ` #${saved.lastOrderNumber}` : ""} em {when}</p>}
      <div className="grid grid-cols-2 gap-2 pt-2">
        <button type="button" className="btn-secondary min-h-12" onClick={onSkip}>Não, digitar</button>
        <button type="button" className="btn-primary min-h-12" onClick={onUse}>Sim, usar</button>
      </div>
    </div>
  </Modal>;
}
