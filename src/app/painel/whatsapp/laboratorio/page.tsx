"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Bot, FlaskConical, Loader2, Paperclip, Plus, Send, Trash2, Zap } from "lucide-react";
import { PageHeader } from "@/components/internal/PageHeader";
import { WaText } from "@/components/internal/WaText";
import { fileName, isImageUrl, isPdfUrl } from "@/lib/whatsapp/menuMedia";

type LabSession = { id: string; title: string; updated_at: string; pending: boolean };
type Overview = { configuration: { ready: boolean; missing: string[] }; quiet_seconds: number; sessions: LabSession[] };
type LabMessage = { id: string; role: "user" | "assistant"; content: string; intent: string | null; usage: Record<string, unknown> | null; created_at: string };
type Queued = { id: string; content: string };
type Usage = { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } };

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Falha de conexão.");
  return data as T;
}
const post = <T,>(body: unknown) => call<T>("/api/whatsapp/lab", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

async function readFile(file: File): Promise<{ mime: string; data: string }> {
  if (file.type === "application/pdf") {
    if (file.size > 2_900_000) throw new Error("PDF muito grande (máx. 2,9 MB).");
    const buffer = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let i = 0; i < buffer.length; i += 0x8000) binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
    return { mime: "application/pdf", data: btoa(binary) };
  }
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Envie imagem (JPG, PNG, WebP) ou PDF.");
  // Reduz o print no navegador antes de enviar (o comprovante continua legível).
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return { mime: "image/jpeg", data: canvas.toDataURL("image/jpeg", 0.85).split(",")[1] };
}

export default function WhatsAppLabPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<LabMessage[]>([]);
  const [queue, setQueue] = useState<Queued[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [thinking, setThinking] = useState(false);
  const [simulateOpen, setSimulateOpen] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try { setData(await call<Overview>("/api/whatsapp/lab")); setError(""); }
    catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!selected) { setMessages([]); return; }
    call<{ messages: LabMessage[] }>(`/api/whatsapp/lab?session=${encodeURIComponent(selected)}`).then((r) => setMessages(r.messages), (e) => setError(e.message));
  }, [selected]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [messages.length, queue.length, thinking]);

  const flush = useCallback(async (items: Queued[], file?: { mime: string; data: string }) => {
    if (!selected || (!items.length && !file)) return;
    if (timer.current) clearTimeout(timer.current);
    setQueue([]);
    setThinking(true);
    try {
      const result = await post<{ messages: LabMessage[] }>({ action: "send", session: selected, texts: items.map((q) => q.content), simulate_open: simulateOpen, ...(file ? { file } : {}) });
      setMessages(result.messages);
      void refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setThinking(false); }
  }, [selected, simulateOpen, refresh]);

  // Mensagens seguidas são agrupadas como no número real.
  useEffect(() => {
    if (!queue.length || thinking) return;
    if (timer.current) clearTimeout(timer.current);
    const first = messages.some((m) => m.role === "assistant") ? (data?.quiet_seconds ?? 15) * 1000 : 0;
    timer.current = setTimeout(() => void flush(queue), Math.max(600, first));
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [queue, thinking, flush, data?.quiet_seconds, messages]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!value || !selected) return;
    setQueue((q) => [...q, { id: `${Date.now()}-${q.length}`, content: value }]);
    setText("");
  }
  async function create() {
    try { const { id } = await post<{ id: string }>({ action: "create" }); await refresh(); setSelected(id); }
    catch (e) { setError((e as Error).message); }
  }
  async function remove(id: string) {
    if (!window.confirm("Apagar esta conversa de teste?")) return;
    try { await post({ action: "delete", session: id }); if (selected === id) setSelected(null); await refresh(); }
    catch (e) { setError((e as Error).message); }
  }
  async function attach(file: File | undefined) {
    if (!file) return;
    try { await flush(queue, await readFile(file)); }
    catch (e) { setError((e as Error).message); }
    finally { if (fileInput.current) fileInput.current.value = ""; }
  }

  const totals = messages.reduce((sum, m) => {
    const u = (m.usage || {}) as Usage;
    return { input: sum.input + (u.input_tokens || 0), cached: sum.cached + (u.input_tokens_details?.cached_tokens || 0), output: sum.output + (u.output_tokens || 0) };
  }, { input: 0, cached: 0, output: 0 });

  return (
    <div>
      <PageHeader
        title="Laboratório do robô"
        icon={FlaskConical}
        description="Converse com o robô real (mesmo cardápio, preços e regras do WhatsApp) sem enviar nada para clientes. Pedidos confirmados aqui são só conferidos: nada vai para Pedidos, Caixa ou cozinha."
        actions={<Link href="/painel/whatsapp" className="btn-secondary"><ArrowLeft size={16} />Voltar ao WhatsApp</Link>}
      />
      {error && <p role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {data && !data.configuration.ready && <p className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Para testar, cadastre na Vercel: {data.configuration.missing.join(", ")}.</p>}

      <div className="surface grid h-[calc(100dvh-15rem)] min-h-[520px] overflow-hidden md:grid-cols-[280px_1fr]">
        <aside className={`${selected ? "hidden md:flex" : "flex"} min-h-0 flex-col border-r border-black/5`}>
          <div className="border-b border-black/5 p-3"><button type="button" className="btn-primary w-full" onClick={create}><Plus size={16} />Nova conversa de teste</button></div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {data?.sessions.length === 0 && <li className="p-6 text-center text-sm text-black/45">Crie uma conversa e escreva como se fosse um cliente.</li>}
            {data?.sessions.map((s) => (
              <li key={s.id} className={`flex items-center border-b border-black/[.04] ${s.id === selected ? "bg-basso-cream/70" : ""}`}>
                <button type="button" className="min-w-0 flex-1 px-3 py-3 text-left" onClick={() => setSelected(s.id)}>
                  <p className="truncate text-sm font-bold">{s.title}</p>
                  <p className="text-[11px] text-black/45">{new Date(s.updated_at).toLocaleString("pt-BR")}{s.pending ? " · resumo aguardando" : ""}</p>
                </button>
                <button type="button" className="btn-ghost text-red-600" onClick={() => remove(s.id)} aria-label={`Apagar ${s.title}`}><Trash2 size={15} /></button>
              </li>
            ))}
          </ul>
          <label className="flex items-center gap-2 border-t border-black/5 p-3 text-xs text-black/60">
            <input type="checkbox" checked={simulateOpen} onChange={(e) => setSimulateOpen(e.target.checked)} />
            Simular loja aberta
          </label>
        </aside>

        <section className={`${selected ? "flex" : "hidden md:flex"} min-h-0 flex-col bg-[#f4efe6]`}>
          {!selected ? (
            <div className="grid flex-1 place-items-center p-8 text-center text-sm text-black/45"><div><Bot className="mx-auto mb-3 text-black/20" size={40} />Escolha ou crie uma conversa de teste.</div></div>
          ) : (
            <>
              <header className="flex items-center gap-2 border-b border-black/5 bg-white px-3 py-2.5 text-xs text-black/55">
                <button type="button" className="btn-ghost md:hidden" onClick={() => setSelected(null)} aria-label="Voltar"><ArrowLeft size={18} /></button>
                <span>Tokens: {totals.input.toLocaleString("pt-BR")} entrada ({totals.cached.toLocaleString("pt-BR")} em cache) · {totals.output.toLocaleString("pt-BR")} saída</span>
              </header>
              <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-4 sm:px-6">
                {messages.map((m) => (
                  <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm sm:max-w-[70%] ${m.role === "user" ? "rounded-tr-sm bg-[#d9fdd3]" : m.intent === "order" ? "rounded-tl-sm border border-emerald-300 bg-emerald-50" : "rounded-tl-sm bg-white"}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {isImageUrl(m.content) ? <img src={m.content} alt="Imagem do cardápio" className="max-h-64 rounded-lg" /> : isPdfUrl(m.content) ? <a className="font-semibold underline" href={m.content} target="_blank" rel="noreferrer">📄 {fileName(m.content)}</a> : <WaText text={m.content} />}
                    </div>
                  </div>
                ))}
                {queue.map((q) => <div key={q.id} className="flex justify-end"><div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-[#d9fdd3]/70 px-3 py-2 text-sm text-black/60 sm:max-w-[70%]">{q.content}</div></div>)}
                {thinking && <p className="flex items-center gap-2 text-xs text-black/45"><Loader2 size={14} className="animate-spin" />Robô digitando…</p>}
                <div ref={bottom} />
              </div>
              <form onSubmit={submit} className="flex items-end gap-2 border-t border-black/5 bg-white p-3">
                <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(e) => void attach(e.target.files?.[0])} />
                <button type="button" className="btn-ghost h-11 w-11 shrink-0 p-0" onClick={() => fileInput.current?.click()} aria-label="Enviar comprovante" title="Enviar comprovante (imagem ou PDF)" disabled={thinking}><Paperclip size={18} /></button>
                <textarea className="textarea min-h-11 flex-1 resize-none py-2.5" rows={1} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} placeholder="Escreva como um cliente" aria-label="Mensagem de teste" maxLength={4000} />
                {queue.length > 0 && !thinking && <button type="button" className="btn-secondary h-11 shrink-0" onClick={() => void flush(queue)} title="Responder agora"><Zap size={16} /><span className="hidden sm:inline">Responder agora</span></button>}
                <button type="submit" className="btn-primary h-11 w-11 shrink-0 p-0" disabled={!text.trim()} aria-label="Enviar"><Send size={18} /></button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
