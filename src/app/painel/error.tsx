"use client";

import { useEffect, useRef } from "react";
import { AlertCircle, ArrowLeft, Copy, HeartPulse, RefreshCw } from "lucide-react";
import Link from "next/link";

function buildErrorId() {
  try { return `ERR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`; }
  catch { return `ERR-${Date.now().toString(36).toUpperCase()}`; }
}

export default function PanelError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const errorIdRef = useRef("");
  if (!errorIdRef.current) errorIdRef.current = buildErrorId();
  const errorId = errorIdRef.current;

  useEffect(() => {
    const body = {
      errorId,
      route: window.location.pathname,
      message: error.message || "Erro inesperado no painel",
      stack: error.stack?.slice(0, 8000),
      digest: error.digest,
      appVersion: "9.0.0",
      userAgent: navigator.userAgent,
      online: navigator.onLine,
    };
    fetch("/api/client-errors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true }).catch(() => undefined);
  }, [error, errorId]);

  return <section className="surface mx-auto max-w-2xl p-8 text-center">
    <AlertCircle className="mx-auto text-red-700" size={40} />
    <p className="mt-4 text-xs font-black uppercase tracking-[.16em] text-red-700">Erro operacional • {errorId}</p>
    <h1 className="mt-2 font-display text-3xl font-bold">Esta área do painel encontrou um erro</h1>
    <p className="mt-3 text-sm leading-6 text-black/55">Nenhuma ação deve ser considerada concluída enquanto esta mensagem estiver visível. O erro foi identificado para facilitar o diagnóstico.</p>
    <div className="mx-auto mt-4 max-w-lg rounded-xl bg-black/[.035] p-3 text-left text-xs text-black/55"><strong>Referência:</strong> {errorId}<br /><span className="line-clamp-2">{error.message || "Erro inesperado"}</span></div>
    <div className="mt-6 flex flex-wrap justify-center gap-3">
      <button className="btn-primary" onClick={reset}><RefreshCw size={17} />Recarregar área</button>
      <button className="btn-secondary" onClick={() => history.back()}><ArrowLeft size={17} />Voltar</button>
      <Link className="btn-secondary" href="/painel/diagnostico"><HeartPulse size={17} />Abrir diagnóstico</Link>
      <button className="btn-ghost" onClick={() => navigator.clipboard?.writeText(errorId)}><Copy size={16} />Copiar ID</button>
    </div>
  </section>;
}
