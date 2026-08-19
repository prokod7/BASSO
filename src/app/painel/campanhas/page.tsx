"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { CalendarClock, Loader2, Mail, Megaphone, Play, Plus, Smartphone, X } from "lucide-react";
import { PageHeader } from "@/components/internal/PageHeader";
import { demoActions, useDemoState } from "@/lib/demo-store";
import { apiJson, formatApiError, requestOperationalRefresh } from "@/lib/client/api";
import { isDemoMode, shortDateTime, uid } from "@/lib/utils";
import type { CampaignRecord } from "@/types";

const statusLabel: Record<CampaignRecord["status"], string> = {
  draft: "Rascunho",
  scheduled: "Agendada",
  running: "Em processamento",
  completed: "Concluída",
  cancelled: "Cancelada",
};

type CampaignListResponse = { campaigns: CampaignRecord[] };

export default function CampaignsPage() {
  const demoCampaigns = useDemoState((state) => state.campaigns);
  const [remoteCampaigns, setRemoteCampaigns] = useState<CampaignRecord[]>([]);
  const campaigns = isDemoMode() ? demoCampaigns : remoteCampaigns;
  const [loading, setLoading] = useState(!isDemoMode());
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<"push" | "email">("push");
  const [segment, setSegment] = useState<CampaignRecord["segment"]["type"]>("inactive");
  const [minimumSpend, setMinimumSpend] = useState("");
  const [title, setTitle] = useState("La Forneria Basso");
  const [message, setMessage] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (isDemoMode()) return;
    setLoading(true);
    try {
      const body = await apiJson<CampaignListResponse>("/api/campaigns");
      setRemoteCampaigns(body.campaigns || []);
    } catch (error) {
      setFeedback(formatApiError(error, "Falha ao carregar campanhas."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (name.trim().length < 2 || message.trim().length < 2 || title.trim().length < 2) {
      setFeedback("Informe nome, título e mensagem da campanha.");
      return;
    }
    const minimumSpendCents = segment === "minimum_spend" ? Math.round(Number(minimumSpend.replace(",", ".")) * 100) : undefined;
    if (segment === "minimum_spend" && (!Number.isFinite(minimumSpendCents) || (minimumSpendCents || 0) < 0)) {
      setFeedback("Informe um gasto mínimo válido.");
      return;
    }
    const campaign: CampaignRecord = {
      id: uid("campaign"),
      name: name.trim(),
      channel,
      segment: { type: segment, minimumSpend: minimumSpendCents },
      template: { title: title.trim(), message: message.trim() },
      status: scheduledAt ? "scheduled" : "draft",
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
      createdAt: new Date().toISOString(),
      metrics: { recipients: 0, sent: 0, opened: 0, converted: 0 },
    };
    setBusy("create"); setFeedback("");
    try {
      if (isDemoMode()) demoActions.addCampaign(campaign);
      else {
        await apiJson("/api/campaigns", {
          method: "POST",
          body: JSON.stringify({
            name: campaign.name,
            channel: campaign.channel,
            segment: campaign.segment,
            template: campaign.template,
            scheduledAt: campaign.scheduledAt || null,
          }),
        });
        await load();
        requestOperationalRefresh();
      }
      setOpen(false); setName(""); setMessage(""); setScheduledAt("");
      setFeedback("Campanha salva. Em produção, somente clientes próprios com consentimento elegível entram na seleção.");
    } catch (error) {
      setFeedback(formatApiError(error, "Falha ao salvar campanha."));
    } finally { setBusy(null); }
  }

  async function run(campaign: CampaignRecord) {
    setBusy(campaign.id); setFeedback("");
    try {
      if (isDemoMode()) {
        const recipients = campaign.segment.type === "inactive" ? 18 : campaign.segment.type === "frequent" ? 34 : 52;
        demoActions.updateCampaign(campaign.id, "completed", { recipients, sent: recipients, opened: Math.round(recipients * .64), converted: Math.round(recipients * .12) });
        setFeedback("Campanha simulada e concluída no modo demonstração.");
        return;
      }
      const body = await apiJson<{ queued: number; recipients?: number }>(`/api/campaigns/${campaign.id}`, { method: "PATCH", body: JSON.stringify({ action: "run" }) });
      await load();
      requestOperationalRefresh();
      setFeedback(`${body.queued} envio(s) colocado(s) na fila.`);
    } catch (error) { setFeedback(formatApiError(error, "Falha ao processar campanha.")); }
    finally { setBusy(null); }
  }

  async function cancel(campaign: CampaignRecord) {
    const reason = window.prompt("Informe o motivo do cancelamento da campanha:", "Cancelada pelo gestor")?.trim();
    if (!reason) return;
    setBusy(campaign.id); setFeedback("");
    try {
      if (isDemoMode()) demoActions.updateCampaign(campaign.id, "cancelled", campaign.metrics);
      else {
        await apiJson(`/api/campaigns/${campaign.id}`, { method: "PATCH", body: JSON.stringify({ action: "cancel", reason }) });
        await load();
        requestOperationalRefresh();
      }
      setFeedback("Campanha cancelada e registrada na auditoria.");
    } catch (error) { setFeedback(formatApiError(error, "Falha ao cancelar campanha.")); }
    finally { setBusy(null); }
  }

  return <>
    <PageHeader title="Campanhas segmentadas" icon={Megaphone} description="Push e e-mail com consentimento, segmentação, agendamento, fila de retentativas e métricas. WhatsApp permanece manual." actions={<button className="btn-primary" onClick={() => setOpen(true)}><Plus size={17} />Nova campanha</button>} />
    <div className="grid gap-4 md:grid-cols-4"><Summary label="Rascunhos" value={campaigns.filter((campaign) => campaign.status === "draft").length} /><Summary label="Agendadas" value={campaigns.filter((campaign) => campaign.status === "scheduled").length} /><Summary label="Em processamento" value={campaigns.filter((campaign) => campaign.status === "running").length} /><Summary label="Concluídas" value={campaigns.filter((campaign) => campaign.status === "completed").length} /></div>
    {loading && <p className="mt-6 surface p-6 text-sm font-semibold text-black/55">Carregando campanhas do servidor...</p>}
    <div className="mt-6 space-y-4">{campaigns.map((campaign) => <article key={campaign.id} className="surface p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div className="flex gap-4"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-basso-cream text-basso-wine">{campaign.channel === "push" ? <Smartphone /> : <Mail />}</span><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-xl font-bold">{campaign.name}</h2><span className="rounded-full bg-black/5 px-2 py-1 text-[10px] font-black uppercase">{statusLabel[campaign.status]}</span></div><p className="mt-1 text-sm text-black/50">{segmentLabel(campaign.segment)} • {campaign.channel === "push" ? "Push" : "E-mail"}</p>{campaign.scheduledAt && <p className="mt-1 flex items-center gap-1 text-xs text-black/40"><CalendarClock size={14} />{shortDateTime(campaign.scheduledAt)}</p>}</div></div><div className="flex gap-2">{["draft", "scheduled"].includes(campaign.status) && <><button disabled={busy === campaign.id} className="btn-primary" onClick={() => run(campaign)}>{busy === campaign.id ? <Loader2 className="animate-spin" size={17} /> : <Play size={17} />}Enviar agora</button><button disabled={busy === campaign.id} className="btn-secondary" onClick={() => cancel(campaign)}>Cancelar</button></>}</div></div><div className="mt-5 rounded-2xl bg-basso-paper p-4"><strong className="text-sm">{campaign.template.title}</strong><p className="mt-1 text-sm text-black/60">{campaign.template.message}</p></div><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric label="Destinatários" value={campaign.metrics.recipients} /><Metric label="Enviados" value={campaign.metrics.sent} /><Metric label="Aberturas" value={campaign.metrics.opened} /><Metric label="Conversões" value={campaign.metrics.converted} /></div></article>)}{!loading && !campaigns.length && <p className="surface p-8 text-center text-sm text-black/45">Nenhuma campanha cadastrada.</p>}</div>
    {feedback && <p className="mt-5 rounded-xl bg-blue-50 p-4 text-sm font-semibold text-blue-800">{feedback}</p>}
    <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">Clientes de iFood e 99Food são excluídos da seleção. Cada canal exige consentimento específico.</p>
    {open && <div className="fixed inset-0 z-[100] grid place-items-center bg-black/50 p-4"><form onSubmit={create} className="surface max-h-[92vh] w-full max-w-2xl overflow-y-auto p-6"><div className="flex items-center justify-between"><h2 className="font-display text-2xl font-bold">Nova campanha</h2><button type="button" onClick={() => setOpen(false)}><X /></button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="sm:col-span-2"><span className="label">Nome interno</span><input className="input" value={name} onChange={(event) => setName(event.target.value)} /></label><label><span className="label">Canal</span><select className="input" value={channel} onChange={(event) => setChannel(event.target.value as "push" | "email")}><option value="push">Push</option><option value="email">E-mail</option></select></label><label><span className="label">Segmento</span><select className="input" value={segment} onChange={(event) => setSegment(event.target.value as CampaignRecord["segment"]["type"])}><option value="all">Todos consentidos</option><option value="new">Novos</option><option value="active">Ativos</option><option value="frequent">Frequentes</option><option value="inactive">Inativos</option><option value="birthday">Aniversariantes do dia</option><option value="minimum_spend">Gasto mínimo</option></select></label>{segment === "minimum_spend" && <label><span className="label">Gasto mínimo</span><input className="input" value={minimumSpend} onChange={(event) => setMinimumSpend(event.target.value)} inputMode="decimal" /></label>}<label className={segment === "minimum_spend" ? "" : "sm:col-span-2"}><span className="label">Agendar para (opcional)</span><input className="input" type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} /></label><label className="sm:col-span-2"><span className="label">Título</span><input className="input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} /></label><label className="sm:col-span-2"><span className="label">Mensagem</span><textarea className="textarea min-h-32" value={message} onChange={(event) => setMessage(event.target.value)} maxLength={2000} /></label></div><button type="submit" disabled={busy === "create"} className="btn-primary mt-5 w-full">{busy === "create" ? <Loader2 className="animate-spin" size={17} /> : null}Salvar campanha</button></form></div>}
  </>;
}

function Summary({ label, value }: { label: string; value: number }) { return <div className="surface p-4"><p className="text-xs font-bold uppercase text-black/40">{label}</p><p className="mt-1 text-2xl font-black text-basso-wine">{value}</p></div>; }
function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-xl bg-white p-3 text-center"><p className="text-[10px] font-bold uppercase text-black/40">{label}</p><p className="mt-1 text-lg font-black">{value}</p></div>; }
function segmentLabel(segment: CampaignRecord["segment"]) { return ({ all: "Todos consentidos", new: "Clientes novos", active: "Clientes ativos", frequent: "Clientes frequentes", inactive: "Clientes inativos", birthday: "Aniversariantes do dia", minimum_spend: `Gasto mínimo de R$ ${((segment.minimumSpend || 0) / 100).toFixed(2).replace(".", ",")}` } as Record<string, string>)[segment.type]; }
