"use client";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function DriverAuthorizationPage() {
  const router = useRouter();
  const [document, setDocument] = useState<{ version: string; title: string; body: string } | null>(null);
  const [name, setName] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { void fetch("/api/drivers/authorization", { cache: "no-store" }).then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error); setDocument(data.document); setName(data.name); }).catch(e => setError(e.message)); }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!document || !accepted || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/drivers/authorization", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: document.version, name, accepted }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      router.replace("/painel/motoboy"); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao salvar."); } finally { setBusy(false); }
  }
  return <main className="min-h-dvh bg-basso-black p-4 sm:p-8"><form onSubmit={submit} className="mx-auto max-w-2xl rounded-3xl bg-white p-6 sm:p-8">
    <p className="text-xs font-black uppercase tracking-widest text-basso-wine">La Forneria Basso • Acesso do motoboy</p>
    <h1 className="mt-3 font-display text-3xl font-bold">{document?.title || "Autorização de uso"}</h1>
    {document ? <><p className="mt-2 text-xs text-black/50">Versão {document.version} • Leia antes de continuar.</p><div className="mt-5 whitespace-pre-wrap text-sm leading-7">{document.body}</div>
      <label className="mt-6 block"><span className="label">Confirme seu nome completo</span><input className="input" required minLength={2} maxLength={100} autoComplete="name" value={name} onChange={e => setName(e.target.value)} /></label>
      <label className="mt-5 flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" required checked={accepted} onChange={e => setAccepted(e.target.checked)} /><span>Li e aceito os termos de uso e as autorizações descritas acima. Confirmo que utilizarei minha própria conta.</span></label>
      <button className="btn-primary mt-6 w-full" disabled={!accepted || busy}>{busy ? "Registrando aceite..." : "Aceitar e acessar minhas entregas"}</button></> : !error && <p className="mt-5">Carregando termos...</p>}
    {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <button type="button" className="btn-ghost mt-3 w-full" onClick={async () => { await createClient()?.auth.signOut(); router.replace("/login"); }}>Sair</button>
  </form></main>;
}
