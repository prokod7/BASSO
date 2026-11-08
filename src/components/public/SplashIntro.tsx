"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

export const SPLASH_STORAGE_KEY = "lfb-splash-seen";
const SPLASH_ID = "basso-splash";
const DURATION_MS = 2400;
const EXIT_MS = 600;

const embers = [
  { left: "18%", delay: "0s", duration: "2.6s", size: 3 },
  { left: "31%", delay: ".6s", duration: "3.1s", size: 2 },
  { left: "44%", delay: ".2s", duration: "2.4s", size: 4 },
  { left: "57%", delay: "1s", duration: "2.9s", size: 2 },
  { left: "66%", delay: ".4s", duration: "2.7s", size: 3 },
  { left: "78%", delay: ".9s", duration: "3.3s", size: 2 },
  { left: "86%", delay: ".1s", duration: "2.5s", size: 3 },
];

/**
 * Abertura animada do cardápio público. Exibida uma vez por sessão do navegador;
 * toque na tela pula a animação. Respeita prefers-reduced-motion.
 */
export function SplashIntro() {
  const [phase, setPhase] = useState<"show" | "leaving" | "done">("show");

  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem(SPLASH_STORAGE_KEY) === "1"; } catch { /* armazenamento bloqueado */ }
    if (seen) { setPhase("done"); return; }
    try { sessionStorage.setItem(SPLASH_STORAGE_KEY, "1"); } catch { /* armazenamento bloqueado */ }
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const visible = reduce ? 700 : DURATION_MS;
    const leave = window.setTimeout(() => setPhase("leaving"), visible);
    const done = window.setTimeout(() => setPhase("done"), visible + EXIT_MS);
    return () => { window.clearTimeout(leave); window.clearTimeout(done); };
  }, []);

  useEffect(() => {
    if (phase !== "leaving") return;
    const done = window.setTimeout(() => setPhase("done"), EXIT_MS);
    return () => window.clearTimeout(done);
  }, [phase]);

  if (phase === "done") return null;

  return (
    <>
      <div
        id={SPLASH_ID}
        role="status"
        aria-live="polite"
        aria-label="Carregando La Forneria Basso"
        onClick={() => setPhase("leaving")}
        suppressHydrationWarning
        className={`splash-root fixed inset-0 z-[200] flex cursor-pointer flex-col overflow-hidden bg-[#0b0907] text-white ${phase === "leaving" ? "splash-leave" : ""}`}
      >
        {/* Forno ao fundo */}
        <div className="absolute inset-x-0 top-0 h-[64%] [mask-image:linear-gradient(to_bottom,black_55%,transparent_98%)]">
          <Image src="/assets/brand/banner-institucional.png" alt="" fill priority sizes="(max-width: 768px) 300vw, 100vw" className="splash-oven object-cover object-[86%_30%]" />
          <div className="splash-fire absolute inset-0" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/30 to-[#0b0907]" />
        </div>
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-[30%] top-[18%]">
          {embers.map((ember, index) => (
            <span key={index} className="splash-ember absolute bottom-0 rounded-full bg-amber-400" style={{ left: ember.left, width: ember.size, height: ember.size, animationDelay: ember.delay, animationDuration: ember.duration }} />
          ))}
        </div>

        {/* Marca */}
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pt-24 text-center">
          <div className="splash-logo relative aspect-[762/630] w-64 drop-shadow-[0_4px_24px_rgba(0,0,0,.7)] sm:w-80">
            <Image src="/assets/brand/logo-dourado.png" alt="La Forneria Basso" fill priority sizes="320px" className="object-contain" />
          </div>
          <div aria-hidden className="splash-flag mt-5 flex h-[3px] w-60 overflow-hidden rounded-full shadow-[0_0_10px_rgba(255,255,255,.15)] sm:w-72">
            <span className="flex-1 bg-[#1f8a4c]" /><span className="flex-1 bg-white/90" /><span className="flex-1 bg-[#c8262e]" />
          </div>
          <p className="splash-tagline mt-5 font-display text-lg uppercase tracking-[.22em] text-basso-goldLight sm:text-xl">Pizzaria artesanal</p>
          <p className="splash-tagline-2 mt-1.5 text-[11px] font-semibold uppercase tracking-[.2em] text-white/80 sm:text-xs">Massa de longa fermentação</p>
        </div>

        {/* Carregamento */}
        <div className="splash-loader relative z-10 mx-auto w-full max-w-sm px-8 pb-[max(3rem,env(safe-area-inset-bottom))] text-center">
          <p className="text-sm font-semibold text-basso-goldLight">Carregando...</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10 ring-1 ring-white/10">
            <div className="splash-progress h-full rounded-full bg-gradient-to-r from-[#8a6a2f] via-basso-goldLight to-[#f3dfa6]" style={{ animationDuration: `${DURATION_MS}ms` }} />
          </div>
          <p className="mt-3 text-xs text-white/60">Preparando sua melhor experiência</p>
        </div>
      </div>
      {/* Esconde antes da pintura se a abertura já foi vista nesta sessão (evita piscar). */}
      <script
        dangerouslySetInnerHTML={{ __html: `try{if(sessionStorage.getItem("${SPLASH_STORAGE_KEY}")==="1"){var s=document.getElementById("${SPLASH_ID}");if(s)s.style.display="none"}}catch(e){}` }}
      />
    </>
  );
}
