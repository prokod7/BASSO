"use client";
import { useEffect, useRef, useState } from "react";
import { BellRing, Volume2 } from "lucide-react";
import { BASSO_NEW_ORDER_AUDIO } from "@/lib/basso-notification-audio";

type Alert = { id: string; sessionId: string; name: string; at: string };
export function WhatsAppHandoffAlert({ enabled }: { enabled: boolean }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [blocked, setBlocked] = useState(false);
  const player = useRef<HTMLAudioElement | null>(null);
  const heard = useRef(new Set<string>());
  const lastRing = useRef(0);
  useEffect(() => {
    if (!enabled) { setAlerts([]); return; }
    let mounted = true, loading = false;
    const sound = async () => {
      player.current ||= new Audio(BASSO_NEW_ORDER_AUDIO);
      try { player.current.currentTime = 0; await player.current.play(); if (mounted) setBlocked(false); } catch { if (mounted) setBlocked(true); }
    };
    const poll = async () => {
      if (loading) return; loading = true;
      try {
        const r = await fetch("/api/whatsapp/handoffs", { cache: "no-store" });
        if (!r.ok) return;
        const { alerts: next } = await r.json() as { alerts: Alert[] };
        if (!mounted) return; setAlerts(next);
        const fresh = next.some(a => !heard.current.has(a.id));
        if (next.length && (fresh || Date.now() - lastRing.current >= 30000)) {
          next.forEach(a => heard.current.add(a.id)); lastRing.current = Date.now(); void sound();
        }
      } finally { loading = false; }
    };
    const refresh = () => { void poll().catch(() => undefined); };
    refresh(); const timer = window.setInterval(refresh, 8000);
    window.addEventListener("focus", refresh);
    return () => { mounted = false; clearInterval(timer); window.removeEventListener("focus", refresh); player.current?.pause(); };
  }, [enabled]);
  if (!enabled || !alerts.length) return null;
  return <div role="alert" aria-live="assertive" className="sticky top-16 z-30 border-b-4 border-amber-400 bg-amber-100 px-4 py-3 text-amber-950 shadow-lg">
    <div className="flex flex-wrap items-center gap-3"><BellRing className="animate-pulse" /><strong>{alerts.length} conversa(s) precisa(m) de atendimento humano</strong>
      {alerts.slice(0, 3).map(a => <a className="btn-primary min-h-10 text-xs" key={a.id} href={`/painel/whatsapp?session=${encodeURIComponent(a.sessionId)}`}>Atender {a.name}</a>)}
      {blocked && <button className="btn-secondary min-h-10 text-xs" onClick={async () => { try { await player.current?.play(); setBlocked(false); } catch { setBlocked(true); } }}><Volume2 size={16} />Ativar som dos chamados</button>}
    </div><p className="mt-1 text-xs">O robô transferiu o atendimento. Abra a conversa para tratar o chamado.</p>
  </div>;
}
