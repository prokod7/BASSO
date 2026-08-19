"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="grid min-h-screen place-items-center bg-basso-paper p-6"><section className="surface w-full max-w-xl p-8 text-center"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-red-50 text-red-700"><AlertTriangle size={28}/></span><h1 className="mt-5 font-display text-2xl font-bold">Não foi possível carregar esta área</h1><p className="mt-2 text-sm leading-relaxed text-black/55">A operação não foi confirmada. Tente novamente; se o problema persistir, consulte Sistema e diagnóstico antes de repetir ações financeiras.</p>{error.digest&&<p className="mt-3 font-mono text-[11px] text-black/35">Referência: {error.digest}</p>}<button className="btn-primary mt-6" onClick={reset}><RefreshCw size={17}/>Tentar novamente</button></section></main>;
}
