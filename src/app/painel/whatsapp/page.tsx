"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Bot, Check, CheckCheck, FlaskConical, Headset, Loader2, MessageCircle, Search, Send, Settings2, X } from "lucide-react";
import { PageHeader } from "@/components/internal/PageHeader";
import { WaText } from "@/components/internal/WaText";
import { fileName, isImageUrl, isPdfUrl } from "@/lib/whatsapp/menuMedia";

type Conversation = {
  id: string; phone: string; name: string | null; customer_name: string | null; paused: boolean; last_inbound: string | null;
  last_body: string | null; last_author: "customer" | "bot" | "agent" | null; last_direction: "in" | "out" | null; last_status: string | null; last_at: string | null; unread: number;
};
type Overview = {
  configuration: { enabled: boolean; ready: boolean; missing: string[] };
  canSend: boolean; enabled: boolean; quiet_seconds: number; max_wait_seconds: number; follow_up_seconds: number; pix_name: string;
  conversations: Conversation[]; usage: { delivered: number; remaining: number; excess: number };
  failures: { id: string; state: string; error: string | null; created_at: string }[];
};
type Message = { id: string; direction: "in" | "out"; author: "customer" | "bot" | "agent"; kind: string; body: string; status: string; created_at: string };
type Detail = { session: { id: string; phone: string; name: string | null; paused: boolean; last_inbound: string | null }; messages: Message[] };

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Falha de conexão.");
  return data as T;
}
const post = (body: unknown) => call<{ ok: boolean }>("/api/whatsapp/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

function formatPhone(phone: string) {
  const d = phone.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : phone;
}
const displayName = (c: { name: string | null; customer_name?: string | null; phone: string }) => c.customer_name || c.name || formatPhone(c.phone);
const listTime = (iso: string) => {
  const date = new Date(iso);
  const today = new Date().toDateString() === date.toDateString();
  return today ? date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};
const initials = (name: string) => name.replace(/[^\p{L}\s]/gu, "").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "#";

function Ticks({ status }: { status: string }) {
  if (status === "read") return <CheckCheck size={14} className="shrink-0 text-sky-500" aria-label="Lida" />;
  if (status === "delivered") return <CheckCheck size={14} className="shrink-0 text-black/40" aria-label="Entregue" />;
  if (status === "failed") return <X size={14} className="shrink-0 text-red-600" aria-label="Falhou" />;
  return <Check size={14} className="shrink-0 text-black/40" aria-label="Enviada" />;
}

export default function WhatsAppInboxPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "human">("all");
  const [panel, setPanel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try { setData(await call<Overview>("/api/whatsapp/admin")); setError(""); }
    catch (e) { setError((e as Error).message); }
  }, []);
  const load = useCallback(async (id: string) => {
    try { setDetail(await call<Detail>(`/api/whatsapp/admin?session=${encodeURIComponent(id)}`)); }
    catch (e) { setError((e as Error).message); }
  }, []);

  useEffect(() => { void refresh(); const t = setInterval(() => void refresh(), 5000); return () => clearInterval(t); }, [refresh]);
  useEffect(() => {
    if (!selected) return;
    setDetail(null);
    void load(selected);
    const t = setInterval(() => void load(selected), 3000);
    return () => clearInterval(t);
  }, [selected, load]);
  const unreadSelected = data?.conversations.find((c) => c.id === selected)?.unread;
  useEffect(() => { if (selected && unreadSelected) void post({ action: "read", id: selected }).then(refresh, () => null); }, [selected, unreadSelected, refresh]);
  const messageCount = detail?.messages.length ?? 0;
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [messageCount, selected]);

  const conversations = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    return (data?.conversations ?? []).filter((c) => {
      if (filter === "unread" && !c.unread) return false;
      if (filter === "human" && !c.paused) return false;
      return !q || displayName(c).toLowerCase().includes(q) || (digits.length > 0 && c.phone.includes(digits));
    });
  }, [data, query, filter]);
  const current = data?.conversations.find((c) => c.id === selected);
  const thread = detail?.session.id === selected ? detail : null;
  const windowOpen = !!thread?.session.last_inbound && Date.now() - Date.parse(thread.session.last_inbound) < 24 * 3600000;
  const blocked = !data?.canSend ? "Conecte o número do WhatsApp (Dualhook) para responder por aqui." : thread && !windowOpen ? "Passaram 24 h desde a última mensagem do cliente: o WhatsApp só libera resposta quando ele escrever de novo." : "";
  const robotOn = !!data?.enabled && !!data?.configuration.enabled;

  async function act(body: unknown) {
    setBusy(true);
    try { await post(body); await refresh(); if (selected) await load(selected); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!selected || !value || sending) return;
    setSending(true);
    try { await post({ action: "send", id: selected, text: value }); setText(""); await load(selected); await refresh(); }
    catch (e) { setError((e as Error).message); }
    finally { setSending(false); }
  }

  return (
    <div>
      <PageHeader
        title="WhatsApp"
        icon={MessageCircle}
        description="Conversas do número da pizzaria: cliente, robô e equipe no mesmo lugar. Responder por aqui pausa o robô naquela conversa."
        actions={<>
          <Link href="/painel/whatsapp/laboratorio" className="btn-secondary"><FlaskConical size={16} />Laboratório</Link>
          <button type="button" className="btn-secondary" aria-pressed={panel} onClick={() => setPanel((v) => !v)}><Settings2 size={16} />Configurar robô</button>
        </>}
      />
      {error && <p role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {panel && data && <SettingsPanel data={data} busy={busy} onAct={act} onClose={() => setPanel(false)} />}

      <div className="surface grid h-[calc(100dvh-15rem)] min-h-[520px] overflow-hidden md:grid-cols-[340px_1fr]">
        <aside className={`${selected ? "hidden md:flex" : "flex"} min-h-0 flex-col border-r border-black/5`} aria-label="Conversas">
          <div className="flex items-center gap-2 border-b border-black/5 p-3">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${robotOn ? "bg-emerald-100 text-emerald-800" : "bg-black/5 text-black/55"}`}>
              <Bot size={13} />{robotOn ? "Robô ligado" : "Robô desligado"}
            </span>
            {data && <span className="ml-auto text-[11px] text-black/45">{data.usage.delivered} respostas do robô no mês</span>}
          </div>
          <div className="space-y-2 border-b border-black/5 p-3">
            <label className="flex h-10 items-center gap-2 rounded-xl bg-black/[.04] px-3">
              <Search size={15} className="text-black/40" aria-hidden />
              <input className="w-full bg-transparent text-sm outline-none" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pesquisar nome ou número" aria-label="Pesquisar conversas" />
            </label>
            <div className="flex gap-1.5" role="group" aria-label="Filtros">
              {([["all", "Tudo"], ["unread", "Não lidas"], ["human", "Com atendente"]] as const).map(([key, label]) => (
                <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${filter === key ? "bg-basso-wine text-white" : "bg-black/[.04] text-black/60"}`}>{label}</button>
              ))}
            </div>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {!data && !error && <li className="p-6 text-center text-sm text-black/45"><Loader2 className="mx-auto animate-spin" size={18} /></li>}
            {data && !conversations.length && <li className="p-6 text-center text-sm text-black/45">{data.conversations.length ? "Nenhuma conversa neste filtro." : "As conversas aparecem aqui assim que os clientes escreverem para o número conectado."}</li>}
            {conversations.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => setSelected(c.id)} aria-current={c.id === selected} className={`flex w-full items-center gap-3 border-b border-black/[.04] px-3 py-3 text-left transition hover:bg-basso-cream/50 ${c.id === selected ? "bg-basso-cream/70" : ""}`}>
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-basso-wine/10 text-sm font-bold text-basso-wine">{initials(displayName(c))}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-bold">{displayName(c)}</span>
                      {c.last_at && <span className={`shrink-0 text-[11px] ${c.unread ? "font-bold text-emerald-700" : "text-black/40"}`}>{listTime(c.last_at)}</span>}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-xs text-black/50">
                      {c.last_direction === "out" && <Ticks status={c.last_status ?? "sent"} />}
                      {c.last_author === "bot" && <Bot size={13} className="shrink-0" aria-label="Robô" />}
                      {c.last_author === "agent" && <Headset size={13} className="shrink-0" aria-label="Equipe" />}
                      <span className="truncate">{c.last_body && isImageUrl(c.last_body) ? "📷 Imagem" : c.last_body && isPdfUrl(c.last_body) ? "📄 Documento" : c.last_body || "Sem mensagens"}</span>
                      <span className="ml-auto flex shrink-0 items-center gap-1">
                        {c.paused && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">Atendente</span>}
                        {!!c.unread && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-emerald-600 px-1 text-[10px] font-bold text-white">{c.unread}</span>}
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className={`${selected ? "flex" : "hidden md:flex"} min-h-0 flex-col bg-[#f4efe6]`} aria-label="Conversa">
          {!selected || !current ? (
            <div className="grid flex-1 place-items-center p-8 text-center text-sm text-black/45">
              <div><MessageCircle className="mx-auto mb-3 text-black/20" size={40} />Escolha uma conversa para ver as mensagens.</div>
            </div>
          ) : (
            <>
              <header className="flex items-center gap-3 border-b border-black/5 bg-white px-3 py-2.5">
                <button type="button" className="btn-ghost md:hidden" onClick={() => setSelected(null)} aria-label="Voltar para conversas"><ArrowLeft size={18} /></button>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-basso-wine/10 text-sm font-bold text-basso-wine">{initials(displayName(current))}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{displayName(current)}</p>
                  <p className="text-xs text-black/45">{formatPhone(current.phone)} · {current.paused ? "Atendente no comando" : robotOn ? "Robô atendendo" : "Robô desligado"}</p>
                </div>
                {current.paused
                  ? <button type="button" className="btn-secondary" disabled={busy} onClick={() => act({ action: "session", id: current.id, paused: false })}><Bot size={16} /><span className="hidden sm:inline">Devolver ao robô</span></button>
                  : <button type="button" className="btn-secondary" disabled={busy} onClick={() => act({ action: "session", id: current.id, paused: true })}><Headset size={16} /><span className="hidden sm:inline">Assumir conversa</span></button>}
              </header>
              <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-4 sm:px-6">
                {!thread && <p className="text-center text-sm text-black/45"><Loader2 className="mx-auto animate-spin" size={18} /></p>}
                {thread?.messages.map((m) => <Bubble key={m.id} message={m} />)}
                <div ref={bottom} />
              </div>
              {blocked ? (
                <p className="border-t border-black/5 bg-white p-3 text-center text-xs text-black/55">{blocked}</p>
              ) : (
                <form onSubmit={send} className="flex items-end gap-2 border-t border-black/5 bg-white p-3">
                  <textarea
                    className="textarea min-h-11 flex-1 resize-none py-2.5"
                    rows={1}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
                    placeholder={current.paused ? "Digite uma mensagem" : "Responder aqui pausa o robô nesta conversa"}
                    aria-label="Mensagem"
                    maxLength={4000}
                  />
                  <button type="submit" className="btn-primary h-11 w-11 shrink-0 p-0" disabled={!text.trim() || sending} aria-label="Enviar">{sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}</button>
                </form>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function Bubble({ message: m }: { message: Message }) {
  const out = m.direction === "out";
  const image = m.kind === "image" && isImageUrl(m.body) ? m.body : null;
  const pdf = m.kind === "document" && isPdfUrl(m.body) ? m.body : null;
  return (
    <div className={`flex ${out ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm sm:max-w-[70%] ${out ? m.author === "bot" ? "rounded-tr-sm bg-[#e7f6dc]" : "rounded-tr-sm bg-[#d9f0ff]" : "rounded-tl-sm bg-white"}`}>
        {out && <p className="mb-0.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-black/40">{m.author === "bot" ? <><Bot size={11} />Robô</> : <><Headset size={11} />Equipe</>}</p>}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {image ? <img src={image} alt="Imagem enviada" className="max-h-64 rounded-lg" /> : pdf ? <a href={pdf} target="_blank" rel="noreferrer" className="font-semibold underline">📄 {fileName(pdf)}</a> : <WaText text={m.body} />}
        <p className="mt-1 flex items-center justify-end gap-1 text-[10px] text-black/40">
          {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          {out && <Ticks status={m.status} />}
        </p>
      </div>
    </div>
  );
}

function SettingsPanel({ data, busy, onAct, onClose }: { data: Overview; busy: boolean; onAct: (body: unknown) => Promise<void>; onClose: () => void }) {
  const [quiet, setQuiet] = useState(String(data.quiet_seconds));
  const [maxWait, setMaxWait] = useState(String(data.max_wait_seconds));
  const [followUp, setFollowUp] = useState(String(Math.round(data.follow_up_seconds / 60)));
  const [pixName, setPixName] = useState(data.pix_name);
  const { configuration } = data;
  return (
    <section className="surface mb-4 p-5" aria-label="Configurações do robô">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold">Robô de atendimento</h2>
          <p className="text-sm text-black/50">Atende, monta o pedido, confere o Pix e manda para a cozinha pelo mesmo checkout do site.</p>
        </div>
        <button type="button" className="btn-ghost" onClick={onClose} aria-label="Fechar configurações"><X size={18} /></button>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl bg-basso-paper p-4">
          <p className="label">Situação</p>
          {!configuration.enabled && <p className="text-sm text-black/60">Liberação na Vercel pendente: defina <code>WHATSAPP_BOT_ENABLED=true</code> depois de homologar.</p>}
          {configuration.missing.length > 0 && <p className="mt-2 text-sm text-amber-800">Falta cadastrar na Vercel: {configuration.missing.join(", ")}.</p>}
          {configuration.enabled && configuration.ready && <p className="text-sm text-emerald-700">Configuração completa.</p>}
          <button type="button" className={`${data.enabled ? "btn-secondary" : "btn-primary"} mt-3 w-full`} disabled={busy || (!data.enabled && !(configuration.enabled && configuration.ready))} onClick={() => onAct({ action: "toggle", enabled: !data.enabled })}>
            <Bot size={16} />{data.enabled ? "Desligar robô" : "Ligar robô"}
          </button>
          <p className="mt-3 text-xs text-black/45">Franquia: {data.usage.delivered} de 2.000 respostas no mês{data.usage.excess ? ` · ${data.usage.excess} excedentes` : ""}.</p>
        </div>
        <form className="rounded-2xl bg-basso-paper p-4 lg:col-span-2" onSubmit={(e) => { e.preventDefault(); void onAct({ action: "settings", quiet_seconds: Number(quiet) || 0, max_wait_seconds: Number(maxWait) || 0, follow_up_seconds: Math.round((Number(followUp) || 0) * 60), pix_name: pixName }); }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label><span className="label">Silêncio antes de responder (s)</span><input className="input" inputMode="numeric" value={quiet} onChange={(e) => setQuiet(e.target.value.replace(/\D/g, ""))} /></label>
            <label><span className="label">Espera máxima (s)</span><input className="input" inputMode="numeric" value={maxWait} onChange={(e) => setMaxWait(e.target.value.replace(/\D/g, ""))} /></label>
            <label><span className="label">Lembrete com o cardápio (min, 0 desliga)</span><input className="input" inputMode="numeric" value={followUp} onChange={(e) => setFollowUp(e.target.value.replace(/\D/g, ""))} /></label>
            <label><span className="label">Nome do recebedor do Pix</span><input className="input" value={pixName} onChange={(e) => setPixName(e.target.value)} placeholder="Como aparece no comprovante" maxLength={120} /></label>
          </div>
          <p className="mt-2 text-xs text-black/45">O robô espera o cliente parar de digitar e responde tudo junto. A primeira mensagem da conversa é respondida na hora. A chave Pix vem de Configurações.</p>
          <button type="submit" className="btn-primary mt-3" disabled={busy}>Salvar ajustes</button>
        </form>
      </div>
      {data.failures.length > 0 && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm">
          <p className="font-bold text-amber-900">Mensagens que precisam de conferência</p>
          <ul className="mt-2 space-y-1 text-amber-900/80">
            {data.failures.slice(0, 8).map((f) => <li key={f.id}>{new Date(f.created_at).toLocaleString("pt-BR")} · {f.state === "uncertain" ? "envio sem confirmação" : "falhou"}{f.error ? ` — ${f.error}` : ""}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}
