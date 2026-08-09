"use client";

import { useEffect, useMemo, useState } from "react";
import {
  type LucideIcon,
  CheckCircle2,
  Clock3,
  FileWarning,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldQuestion,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/internal/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { approvalActionLabels } from "@/lib/admin-control";
import { isDemoMode, shortDateTime, uid } from "@/lib/utils";
import type { ApprovalRequest, ApprovalStatus } from "@/types";

const demoApprovals: ApprovalRequest[] = [
  { id: "approval-demo-1", actionType: "order_discount", entityType: "order", entityId: "order_1048", reason: "Cliente aguardou acima do prazo informado.", requestedPayload: { discountCents: 1000, orderNumber: 1048 }, status: "pending", requestedByName: "Atendente 1", requestedAt: new Date(Date.now() - 12 * 60_000).toISOString() },
  { id: "approval-demo-2", actionType: "stock_adjustment", entityType: "inventory", entityId: "coca-cola-2l", reason: "Duas unidades avariadas durante a descarga.", requestedPayload: { delta: -2 }, status: "approved", requestedByName: "Atendente 2", reviewedByName: "Gestor Demo", requestedAt: new Date(Date.now() - 90 * 60_000).toISOString(), reviewedAt: new Date(Date.now() - 65 * 60_000).toISOString(), reviewNote: "Ajuste conferido com o estoque físico." },
];

const actionOptions = [
  ["order_discount", "Desconto em pedido"],
  ["order_cancel", "Cancelamento de pedido"],
  ["payment_refund", "Estorno de pagamento"],
  ["order_reopen", "Reabertura de pedido"],
  ["cash_reopen", "Reabertura de caixa"],
  ["stock_adjustment", "Correção de estoque"],
  ["loyalty_adjustment", "Correção de fidelidade"],
  ["price_change", "Alteração de preço"],
  ["courtesy", "Cortesia"],
  ["cash_difference", "Fechamento com divergência"],
] as const;

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [status, setStatus] = useState<ApprovalStatus | "all">("pending");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [reviewing, setReviewing] = useState<ApprovalRequest | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [form, setForm] = useState({ actionType: "order_discount", entityType: "order", entityId: "", reason: "", payload: "{}", expiresAt: "" });

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      if (isDemoMode()) {
        setApprovals((current) => current.length ? current : demoApprovals);
        return;
      }
      const response = await fetch("/api/approvals", { cache: "no-store" });
      const body = (await response.json()) as { approvals?: ApprovalRequest[]; error?: string };
      if (!response.ok) throw new Error(body.error || "Falha ao consultar aprovações.");
      setApprovals(body.approvals || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao consultar aprovações.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => approvals.filter((approval) => {
    if (status !== "all" && approval.status !== status) return false;
    const haystack = `${approvalActionLabels[approval.actionType] || approval.actionType} ${approval.entityType} ${approval.entityId} ${approval.reason} ${approval.requestedByName || ""}`.toLowerCase();
    return !query.trim() || haystack.includes(query.trim().toLowerCase());
  }), [approvals, status, query]);

  const counts = useMemo(() => ({ pending: approvals.filter((item) => item.status === "pending").length, approved: approvals.filter((item) => item.status === "approved").length, rejected: approvals.filter((item) => item.status === "rejected").length }), [approvals]);

  async function requestApproval(event: React.FormEvent) {
    event.preventDefault();
    setWorking("create");
    setMessage("");
    try {
      let payload: Record<string, unknown> = {};
      try { payload = JSON.parse(form.payload || "{}"); } catch { throw new Error("O payload adicional precisa ser um JSON válido."); }
      let approval: ApprovalRequest;
      if (isDemoMode()) {
        approval = { id: uid("approval"), actionType: form.actionType, entityType: form.entityType.trim(), entityId: form.entityId.trim(), reason: form.reason.trim(), requestedPayload: payload, status: "pending", requestedByName: "Gestor Demo", requestedAt: new Date().toISOString(), expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined };
      } else {
        const response = await fetch("/api/approvals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actionType: form.actionType, entityType: form.entityType.trim(), entityId: form.entityId.trim(), reason: form.reason.trim(), requestedPayload: payload, expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null }) });
        const body = (await response.json()) as { approval?: ApprovalRequest; error?: string };
        if (!response.ok || !body.approval) throw new Error(body.error || "Falha ao solicitar aprovação.");
        approval = body.approval;
      }
      setApprovals((current) => [approval, ...current]);
      setForm({ actionType: "order_discount", entityType: "order", entityId: "", reason: "", payload: "{}", expiresAt: "" });
      setCreateOpen(false);
      setMessage("Solicitação registrada e encaminhada ao gestor.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao solicitar aprovação.");
    } finally {
      setWorking(null);
    }
  }

  async function decide(decision: "approved" | "rejected") {
    if (!reviewing) return;
    setWorking(reviewing.id);
    setMessage("");
    try {
      if (!isDemoMode()) {
        const response = await fetch(`/api/approvals/${reviewing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, reviewNote: reviewNote.trim() || undefined }) });
        const body = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(body.error || "Falha ao processar aprovação.");
      }
      const now = new Date().toISOString();
      setApprovals((current) => current.map((item) => item.id === reviewing.id ? { ...item, status: decision, reviewedByName: "Gestor", reviewedAt: now, reviewNote: reviewNote.trim() || undefined } : item));
      setReviewing(null);
      setReviewNote("");
      setMessage(decision === "approved" ? "Solicitação aprovada e auditada." : "Solicitação rejeitada e auditada.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao processar aprovação.");
    } finally {
      setWorking(null);
    }
  }

  return (
    <>
      <PageHeader title="Centro de aprovações" icon={ShieldQuestion} description="Controle ações sensíveis como descontos, cortesias, cancelamentos, estornos, reaberturas, correções de estoque e divergências de caixa." actions={<><button className="btn-secondary" onClick={load}><RefreshCw size={17} />Atualizar</button><button className="btn-primary" onClick={() => setCreateOpen(true)}><Plus size={17} />Solicitar aprovação</button></>} />
      {message && <p className={`mb-5 rounded-2xl p-4 text-sm font-semibold ${/falha|erro|json/i.test(message) ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{message}</p>}
      <div className="mb-5 grid gap-3 sm:grid-cols-3"><ApprovalMetric label="Pendentes" value={counts.pending} icon={Clock3} tone="amber" /><ApprovalMetric label="Aprovadas" value={counts.approved} icon={CheckCircle2} tone="green" /><ApprovalMetric label="Rejeitadas" value={counts.rejected} icon={XCircle} tone="red" /></div>
      <section className="surface mb-5 grid gap-3 p-4 md:grid-cols-[1fr_220px]"><label className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30" size={17} /><input className="input pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar ação, pedido, entidade, motivo ou solicitante" /></label><select className="input" value={status} onChange={(event) => setStatus(event.target.value as ApprovalStatus | "all")}><option value="all">Todos os status</option><option value="pending">Pendentes</option><option value="approved">Aprovadas</option><option value="rejected">Rejeitadas</option><option value="expired">Expiradas</option><option value="cancelled">Canceladas</option></select></section>
      {loading && <div className="surface grid min-h-60 place-items-center"><Loader2 className="animate-spin text-basso-wine" size={34} /></div>}
      {!loading && <div className="space-y-4">{filtered.map((approval) => <ApprovalCard key={approval.id} approval={approval} onReview={() => { setReviewing(approval); setReviewNote(approval.reviewNote || ""); }} />)}{!filtered.length && <div className="surface grid min-h-56 place-items-center text-center"><div><ShieldCheck className="mx-auto text-emerald-600" size={38} /><p className="mt-3 font-bold">Nenhuma aprovação nesse filtro</p><p className="text-sm text-black/45">A operação não possui ações sensíveis pendentes.</p></div></div>}</div>}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Solicitar aprovação"><form onSubmit={requestApproval} className="space-y-4 p-5"><label><span className="label">Tipo de ação</span><select className="input" value={form.actionType} onChange={(event) => setForm({ ...form, actionType: event.target.value })}>{actionOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><div className="grid gap-4 sm:grid-cols-2"><label><span className="label">Tipo da entidade</span><input className="input" value={form.entityType} onChange={(event) => setForm({ ...form, entityType: event.target.value })} placeholder="order, payment, inventory..." required /></label><label><span className="label">Identificador</span><input className="input" value={form.entityId} onChange={(event) => setForm({ ...form, entityId: event.target.value })} placeholder="ID ou número relacionado" required /></label></div><label><span className="label">Motivo obrigatório</span><textarea className="textarea" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="Explique por que a ação precisa ser autorizada" required /></label><label><span className="label">Dados adicionais em JSON</span><textarea className="textarea font-mono text-xs" value={form.payload} onChange={(event) => setForm({ ...form, payload: event.target.value })} /></label><label><span className="label">Expiração opcional</span><input type="datetime-local" className="input" value={form.expiresAt} onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} /></label><div className="flex justify-end gap-2 border-t pt-4"><button type="button" className="btn-secondary" onClick={() => setCreateOpen(false)}>Cancelar</button><button type="submit" className="btn-primary" disabled={working === "create"}>{working === "create" ? <Loader2 className="animate-spin" size={17} /> : <ShieldQuestion size={17} />}Solicitar</button></div></form></Modal>
      <Modal open={Boolean(reviewing)} onClose={() => setReviewing(null)} title="Revisar solicitação"><div className="p-5">{reviewing && <><div className="rounded-2xl bg-basso-paper p-4"><p className="text-xs font-black uppercase tracking-[.12em] text-black/35">{approvalActionLabels[reviewing.actionType] || reviewing.actionType}</p><p className="mt-2 font-bold">{reviewing.entityType} • {reviewing.entityId}</p><p className="mt-3 text-sm leading-relaxed text-black/55">{reviewing.reason}</p><pre className="mt-3 overflow-x-auto rounded-xl bg-white p-3 text-[11px] text-black/60">{JSON.stringify(reviewing.requestedPayload, null, 2)}</pre></div><label className="mt-4 block"><span className="label">Parecer do gestor</span><textarea className="textarea" value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="Justificativa da decisão" /></label><div className="mt-4 grid grid-cols-2 gap-3"><button className="btn-secondary border-red-200 text-red-700" disabled={working === reviewing.id} onClick={() => decide("rejected")}><XCircle size={17} />Rejeitar</button><button className="btn-primary" disabled={working === reviewing.id} onClick={() => decide("approved")}>{working === reviewing.id ? <Loader2 className="animate-spin" size={17} /> : <CheckCircle2 size={17} />}Aprovar</button></div></>}</div></Modal>
    </>
  );
}

function ApprovalMetric({ label, value, icon: Icon, tone }: { label: string; value: number; icon: LucideIcon; tone: "amber" | "green" | "red" }) { const colors = tone === "amber" ? "bg-amber-50 text-amber-800" : tone === "green" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"; return <div className="surface flex items-center gap-3 p-4"><span className={`grid h-10 w-10 place-items-center rounded-xl ${colors}`}><Icon size={19} /></span><div><strong className="block text-2xl">{value}</strong><span className="text-xs text-black/45">{label}</span></div></div>; }
function ApprovalCard({ approval, onReview }: { approval: ApprovalRequest; onReview: () => void }) { const statusClass = approval.status === "pending" ? "bg-amber-50 text-amber-800" : approval.status === "approved" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"; return <article className="surface p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-start"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-basso-cream text-basso-wine"><FileWarning size={21} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-xl font-bold">{approvalActionLabels[approval.actionType] || approval.actionType}</h2><span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${statusClass}`}>{approval.status}</span></div><p className="mt-1 text-xs text-black/45">{approval.entityType} • {approval.entityId} • solicitado por {approval.requestedByName || "Equipe"} em {shortDateTime(approval.requestedAt)}</p><p className="mt-3 text-sm leading-relaxed text-black/60">{approval.reason}</p>{approval.reviewNote && <p className="mt-3 rounded-xl bg-basso-paper p-3 text-xs text-black/60"><strong>Parecer:</strong> {approval.reviewNote}</p>}</div>{approval.status === "pending" && <button className="btn-primary shrink-0" onClick={onReview}><ShieldCheck size={17} />Revisar</button>}</div></article>; }
