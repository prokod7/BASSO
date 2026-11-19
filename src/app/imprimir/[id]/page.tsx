"use client";

import { use, useEffect, useState } from "react";
import { useStoreAvailability } from "@/components/public/useStoreAvailability";
import type { OrderDetail } from "@/types";
import { OrderTicket, type PrintType, type Verification } from "@/components/print/OrderTicket";

export default function BrowserPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const store = useStoreAvailability();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [verificationReady, setVerificationReady] = useState(false);
  const [printType, setPrintType] = useState<PrintType>("entrega");
  const [error, setError] = useState("");
  const [printed, setPrinted] = useState(false);

  useEffect(() => {
    const type = new URLSearchParams(window.location.search).get("tipo");
    if (type === "cozinha" || type === "entrega") setPrintType(type);
  }, []);

  useEffect(() => {
    let mounted = true;
    fetch(`/api/orders/${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Não foi possível carregar o pedido.");
        return body.order as OrderDetail;
      })
      .then(value => mounted && setOrder(value))
      .catch(cause => mounted && setError(cause instanceof Error ? cause.message : "Falha ao carregar o pedido."));
    return () => { mounted = false; };
  }, [id]);

  useEffect(() => {
    if (!order) return;
    if (order.channel !== "own_delivery") {
      setVerificationReady(true);
      return;
    }
    let mounted = true;
    fetch(`/api/delivery/verification/${encodeURIComponent(order.id)}`, { cache: "no-store" })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Falha ao preparar código de retirada.");
        return body as Verification;
      })
      .then(body => { if (mounted) setVerification(body); })
      .catch(() => { if (mounted) setVerification(null); })
      .finally(() => { if (mounted) setVerificationReady(true); });
    return () => { mounted = false; };
  }, [order]);

  useEffect(() => {
    if (!order || !verificationReady || printed) return;
    setPrinted(true);
    const timer = window.setTimeout(() => window.print(), 450);
    return () => window.clearTimeout(timer);
  }, [order, verificationReady, printed]);

  if (error) return <main className="mx-auto max-w-xl p-6"><div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800"><strong>Não foi possível preparar a impressão.</strong><p className="mt-2 text-sm">{error}</p></div></main>;
  if (!order) return <main className="grid min-h-screen place-items-center p-6 text-sm text-black/55">Preparando comanda...</main>;

  function switchType(next: PrintType) {
    setPrintType(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tipo", next);
    window.history.replaceState({}, "", url.toString());
  }

  return (
    <main className="print-shell mx-auto min-h-screen w-full max-w-[80mm] bg-white px-[3mm] py-[3mm]">
      <style jsx global>{`
        @page { margin: 0; }
        @media print {
          html, body { background: white !important; margin: 0 !important; padding: 0 !important; }
          .no-print { display: none !important; }
          .print-shell { width: 64mm !important; max-width: none !important; padding: 0 !important; margin: 0 !important; }
        }
      `}</style>
      <div className="no-print mb-4 grid grid-cols-2 gap-2 font-sans">
        <button className={`rounded-xl border px-3 py-2 text-sm font-bold ${printType === "entrega" ? "bg-black text-white" : "bg-white"}`} onClick={() => switchType("entrega")}>Entrega</button>
        <button className={`rounded-xl border px-3 py-2 text-sm font-bold ${printType === "cozinha" ? "bg-black text-white" : "bg-white"}`} onClick={() => switchType("cozinha")}>Cozinha</button>
        <button className="rounded-xl bg-black px-3 py-2 text-sm font-bold text-white" onClick={() => window.print()}>Imprimir novamente</button>
        <button className="rounded-xl border px-3 py-2 text-sm font-bold" onClick={() => window.close()}>Fechar</button>
      </div>
      <OrderTicket order={order} printType={printType} verification={verification} store={store} />
    </main>
  );
}
