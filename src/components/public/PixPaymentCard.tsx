"use client";

import { Check, Copy, QrCode } from "lucide-react";
import { useEffect, useState } from "react";
import { currency } from "@/lib/utils";

type StoreBusiness = { business?: { name?: string; pixKey?: string | null } };

/** Mostra a chave Pix da pizzaria (configurada no painel) com botão de copiar. */
export function PixPaymentCard({ total, className = "" }: { total?: number; className?: string }) {
  const [pixKey, setPixKey] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/store-status", { cache: "no-store" })
      .then(response => (response.ok ? response.json() as Promise<StoreBusiness> : null))
      .then(body => { if (active) setPixKey(body?.business?.pixKey || null); })
      .catch(() => undefined)
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, []);

  const copy = async () => {
    if (!pixKey) return;
    try { await navigator.clipboard.writeText(pixKey); setCopied(true); window.setTimeout(() => setCopied(false), 2500); } catch { /* sem permissão de cópia */ }
  };

  if (!loaded) return null;

  return (
    <section className={`rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-left ${className}`}>
      <p className="flex items-center gap-2 text-sm font-black text-emerald-900"><QrCode size={18} />Pagamento por Pix{typeof total === "number" ? ` • ${currency(total)}` : ""}</p>
      {pixKey ? (
        <>
          <p className="mt-1 text-xs text-emerald-900/75">Copie a chave abaixo, pague no app do seu banco e envie o comprovante pelo WhatsApp.</p>
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-white p-2 pl-3">
            <code className="min-w-0 flex-1 break-all text-sm font-bold text-black/80">{pixKey}</code>
            <button type="button" onClick={copy} className="btn-primary min-h-10 shrink-0 px-3 text-xs">{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Copiada" : "Copiar"}</button>
          </div>
        </>
      ) : (
        <p className="mt-1 text-xs text-emerald-900/75">A equipe confirma o Pix com você na entrega ou na retirada.</p>
      )}
    </section>
  );
}
