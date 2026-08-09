"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Copy,
  Eye,
  Loader2,
  MessageCircleMore,
  Plus,
  RefreshCw,
  Save,
  Smartphone,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { PageHeader } from "@/components/internal/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { isDemoMode } from "@/lib/utils";

type Channel = "manual_whatsapp" | "push" | "email";
type Template = { key: string; name: string; channel: Channel; body: string; active: boolean; sortOrder: number; updatedAt?: string };

const variables = ["{cliente}", "{numero}", "{total}", "{status}", "{previsao}", "{endereco}", "{motoboy}", "{rastreamento}", "{pix}"];
const demoTemplates: Template[] = [
  { key: "confirmation", name: "Pedido confirmado", channel: "manual_whatsapp", body: "Olá, {cliente}! Seu pedido #{numero} foi confirmado pela La Forneria Basso.", active: true, sortOrder: 10 },
  { key: "preparing", name: "Pedido em preparo", channel: "manual_whatsapp", body: "Olá, {cliente}! Seu pedido #{numero} já está em preparo.", active: true, sortOrder: 20 },
  { key: "ready", name: "Pedido pronto", channel: "manual_whatsapp", body: "Olá, {cliente}! Seu pedido #{numero} está pronto.", active: true, sortOrder: 30 },
  { key: "delay", name: "Informar atraso", channel: "manual_whatsapp", body: "Olá, {cliente}! O pedido #{numero} teve um pequeno atraso. A nova previsão é {previsao}.", active: true, sortOrder: 60 },
];

export default function CommunicationPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [draft, setDraft] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newName, setNewName] = useState("");
  const [newBody, setNewBody] = useState("");

  async function load() {
    setLoading(true); setMessage("");
    try {
      if (isDemoMode()) {
        setTemplates(demoTemplates);
        setSelectedKey((current) => current || demoTemplates[0]?.key || "");
        return;
      }
      const response = await fetch("/api/communication-templates", { cache: "no-store" });
      const body = (await response.json()) as { templates?: Template[]; error?: string };
      if (!response.ok) throw new Error(body.error || "Falha ao carregar mensagens.");
      const next = body.templates || [];
      setTemplates(next);
      setSelectedKey((current) => next.some((item) => item.key === current) ? current : next[0]?.key || "");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao carregar mensagens."); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const selected = templates.find((item) => item.key === selectedKey);
    setDraft(selected ? { ...selected } : null);
  }, [selectedKey, templates]);

  const preview = useMemo(() => {
    if (!draft) return "";
    return draft.body
      .replaceAll("{cliente}", "Maria")
      .replaceAll("{numero}", "1048")
      .replaceAll("{total}", "R$ 86,50")
      .replaceAll("{status}", "Em preparo")
      .replaceAll("{previsao}", "21h15")
      .replaceAll("{endereco}", "Rua do Progresso, 407")
      .replaceAll("{motoboy}", "Carlos")
      .replaceAll("{rastreamento}", "https://pedido.exemplo/1048")
      .replaceAll("{pix}", "62.332.415/0001-10");
  }, [draft]);

  async function save() {
    if (!draft) return;
    setSaving(true); setMessage("");
    try {
      if (draft.name.trim().length < 2 || draft.body.trim().length < 1) throw new Error("Informe nome e mensagem.");
      if (isDemoMode()) setTemplates((current) => current.map((item) => item.key === draft.key ? { ...draft } : item));
      else {
        const response = await fetch(`/api/communication-templates/${encodeURIComponent(draft.key)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: draft.name.trim(), channel: draft.channel, body: draft.body.trim(), active: draft.active, sortOrder: draft.sortOrder }) });
        const body = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(body.error || "Falha ao salvar mensagem.");
        setTemplates((current) => current.map((item) => item.key === draft.key ? { ...draft, updatedAt: new Date().toISOString() } : item));
      }
      setMessage("Modelo atualizado e disponível nas comandas.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao salvar mensagem."); }
    finally { setSaving(false); }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    setSaving(true); setMessage("");
    try {
      const key = newKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
      if (key.length < 2 || newName.trim().length < 2 || newBody.trim().length < 1) throw new Error("Preencha a chave, o nome e a mensagem.");
      if (templates.some((item) => item.key === key)) throw new Error("Já existe um modelo com essa chave.");
      const next: Template = { key, name: newName.trim(), channel: "manual_whatsapp", body: newBody.trim(), active: true, sortOrder: Math.max(0, ...templates.map((item) => item.sortOrder)) + 10 };
      if (!isDemoMode()) {
        const response = await fetch("/api/communication-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
        const body = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(body.error || "Falha ao criar mensagem.");
      }
      setTemplates((current) => [...current, next].sort((a,b)=>a.sortOrder-b.sortOrder));
      setSelectedKey(key); setNewKey(""); setNewName(""); setNewBody(""); setCreateOpen(false); setMessage("Novo modelo criado.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao criar mensagem."); }
    finally { setSaving(false); }
  }

  return <>
    <PageHeader title="Comunicação com clientes" icon={MessageCircleMore} description="Administre os textos usados pela equipe no WhatsApp manual. O sistema preenche os dados do pedido e o funcionário revisa antes de enviar." actions={<><button className="btn-secondary" onClick={load} disabled={loading}><RefreshCw size={17}/>{loading?"Atualizando...":"Atualizar"}</button><button className="btn-secondary" onClick={()=>setCreateOpen(true)}><Plus size={17}/>Novo modelo</button><button className="btn-primary" onClick={save} disabled={!draft||saving}>{saving?<Loader2 size={17} className="animate-spin"/>:<Save size={17}/>}Salvar alterações</button></>} />
    {message&&<div className="mb-5 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm font-semibold text-blue-800">{message}</div>}
    <div className="grid gap-6 xl:grid-cols-[.75fr_1.25fr_.8fr]">
      <section className="surface overflow-hidden"><div className="border-b border-black/5 p-4"><h2 className="font-display text-xl font-bold">Modelos</h2><p className="text-xs text-black/45">Clique para editar.</p></div><div className="max-h-[68vh] divide-y divide-black/5 overflow-y-auto">{loading&&<div className="grid min-h-40 place-items-center"><Loader2 className="animate-spin text-basso-wine"/></div>}{templates.map((item)=><button type="button" key={item.key} onClick={()=>setSelectedKey(item.key)} className={`w-full p-4 text-left transition ${selectedKey===item.key?"bg-basso-cream":"hover:bg-black/[.025]"}`}><div className="flex items-center justify-between gap-2"><strong className="text-sm">{item.name}</strong><span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${item.active?"bg-emerald-50 text-emerald-700":"bg-stone-100 text-stone-500"}`}>{item.active?"Ativo":"Pausado"}</span></div><p className="mt-1 line-clamp-2 text-xs text-black/45">{item.body}</p></button>)}</div></section>

      <section className="surface p-5">{draft?<div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.15em] text-black/35">{draft.key}</p><h2 className="font-display text-2xl font-bold">Editar modelo</h2></div><button type="button" className={`flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-bold ${draft.active?"bg-emerald-50 text-emerald-700":"bg-stone-100 text-stone-600"}`} onClick={()=>setDraft({...draft,active:!draft.active})}>{draft.active?<ToggleRight/>:<ToggleLeft/>}{draft.active?"Ativo":"Pausado"}</button></div><label><span className="label">Nome interno</span><input className="input" value={draft.name} onChange={(event)=>setDraft({...draft,name:event.target.value})}/></label><div className="grid gap-4 sm:grid-cols-2"><label><span className="label">Canal</span><select className="input" value={draft.channel} onChange={(event)=>setDraft({...draft,channel:event.target.value as Channel})}><option value="manual_whatsapp">WhatsApp manual</option><option value="push">Push</option><option value="email">E-mail</option></select></label><label><span className="label">Ordem</span><input className="input" type="number" min="0" value={draft.sortOrder} onChange={(event)=>setDraft({...draft,sortOrder:Number(event.target.value)})}/></label></div><label><span className="label">Mensagem</span><textarea className="input min-h-48 resize-y" maxLength={2000} value={draft.body} onChange={(event)=>setDraft({...draft,body:event.target.value})}/><span className="mt-1 block text-right text-[10px] text-black/35">{draft.body.length}/2000</span></label><div><p className="label">Inserir variável</p><div className="flex flex-wrap gap-2">{variables.map((variable)=><button key={variable} type="button" className="rounded-lg border border-black/10 bg-white px-2.5 py-1.5 font-mono text-[11px] font-bold text-basso-wine hover:bg-basso-cream" onClick={()=>setDraft({...draft,body:`${draft.body}${draft.body.endsWith(" ")||!draft.body?"":" "}${variable}`})}>{variable}</button>)}</div></div><div className="rounded-xl bg-amber-50 p-4 text-xs leading-relaxed text-amber-900"><strong>Importante:</strong> o WhatsApp continua manual. O sistema abre a conversa com o texto preenchido, mas não afirma que houve entrega sem confirmação real.</div></div>:<div className="grid min-h-72 place-items-center text-sm text-black/45">Selecione um modelo.</div>}</section>

      <aside className="space-y-5"><section className="surface overflow-hidden"><div className="flex items-center gap-3 border-b border-black/5 p-4"><span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Smartphone size={19}/></span><div><h2 className="font-display text-xl font-bold">Prévia</h2><p className="text-xs text-black/45">Dados de exemplo.</p></div></div><div className="bg-[#efeae2] p-4"><div className="ml-auto max-w-[92%] rounded-2xl rounded-tr-sm bg-[#d9fdd3] p-3 text-sm shadow-sm"><p className="whitespace-pre-wrap leading-relaxed">{preview||"Selecione um modelo para visualizar."}</p><p className="mt-2 text-right text-[9px] text-black/35">21:03 ✓✓</p></div></div></section><section className="surface p-5"><h2 className="font-display text-lg font-bold">Variáveis aceitas</h2><div className="mt-3 space-y-2">{variables.map((variable)=><div key={variable} className="flex items-center justify-between rounded-lg bg-basso-paper px-3 py-2"><code className="text-xs font-bold text-basso-wine">{variable}</code><button type="button" className="text-black/35 hover:text-basso-wine" aria-label={`Copiar ${variable}`} onClick={()=>navigator.clipboard?.writeText(variable)}><Copy size={14}/></button></div>)}</div></section></aside>
    </div>

    <Modal open={createOpen} onClose={()=>setCreateOpen(false)} title="Novo modelo de mensagem"><form onSubmit={create} className="space-y-4"><label><span className="label">Chave técnica</span><input className="input" placeholder="ex.: confirmar_troco" value={newKey} onChange={(event)=>setNewKey(event.target.value)}/><span className="mt-1 block text-[10px] text-black/35">Use letras minúsculas, números e underline.</span></label><label><span className="label">Nome</span><input className="input" value={newName} onChange={(event)=>setNewName(event.target.value)}/></label><label><span className="label">Mensagem</span><textarea className="input min-h-32" value={newBody} onChange={(event)=>setNewBody(event.target.value)}/></label><button className="btn-primary w-full" type="submit" disabled={saving}>{saving?<Loader2 size={17} className="animate-spin"/>:<CheckCircle2 size={17}/>}Criar modelo</button></form></Modal>
  </>;
}
