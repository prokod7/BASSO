"use client";

import { useEffect, useMemo, useState } from "react";
import {
  type LucideIcon,
  Ban,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  ClipboardCheck,
  Filter,
  Loader2,
  PlayCircle,
  Plus,
  RefreshCw,
  Search,
  UserRound,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/internal/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { isDemoMode, shortDateTime, uid } from "@/lib/utils";
import { taskStatusLabels } from "@/lib/admin-control";
import type { NotificationPriority, OperationTask, OperationTaskStatus } from "@/types";

type UserOption = { id: string; displayName: string };

const demoUsers: UserOption[] = [
  { id: "manager", displayName: "Gestor Demo" },
  { id: "counter-1", displayName: "Atendente 1" },
  { id: "waiter-1", displayName: "Garçom 1" },
  { id: "kitchen-1", displayName: "Cozinha" },
  { id: "driver-1", displayName: "Motoboy 1" },
];

const demoTasks: OperationTask[] = [
  { id: "task-demo-1", title: "Conferir estoque de refrigerantes", description: "Validar Coca-Cola 2 L e Guaraná antes da abertura.", priority: "high", status: "open", assignedToName: "Atendente 1", dueAt: new Date(Date.now() + 2 * 60 * 60_000).toISOString(), createdBy: "Gestor Demo", createdAt: new Date(Date.now() - 35 * 60_000).toISOString(), updatedAt: new Date(Date.now() - 35 * 60_000).toISOString() },
  { id: "task-demo-2", title: "Testar impressão da cozinha", description: "Executar teste em 80 mm e confirmar corte de papel.", priority: "urgent", status: "in_progress", assignedToName: "Cozinha", dueAt: new Date(Date.now() + 45 * 60_000).toISOString(), createdBy: "Gestor Demo", createdAt: new Date(Date.now() - 60 * 60_000).toISOString(), updatedAt: new Date(Date.now() - 12 * 60_000).toISOString() },
  { id: "task-demo-3", title: "Retornar contato do pedido #1048", description: "Confirmar complemento do endereço.", priority: "normal", status: "open", assignedToName: "Atendente 1", createdBy: "Gestor Demo", createdAt: new Date(Date.now() - 12 * 60_000).toISOString(), updatedAt: new Date(Date.now() - 12 * 60_000).toISOString() },
];

export default function TasksPage() {
  const [tasks, setTasks] = useState<OperationTask[]>([]);
  const [users, setUsers] = useState<UserOption[]>(demoUsers);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [modal, setModal] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<OperationTaskStatus | "all">("all");
  const [priority, setPriority] = useState<NotificationPriority | "all">("all");
  const [form, setForm] = useState({ title: "", description: "", priority: "normal" as NotificationPriority, assignedTo: "", dueAt: "" });

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      if (isDemoMode()) {
        setTasks((current) => current.length ? current : demoTasks);
        setUsers(demoUsers);
        return;
      }
      const [tasksResponse, usersResponse] = await Promise.all([
        fetch("/api/tasks", { cache: "no-store" }),
        fetch("/api/users?options=1", { cache: "no-store" }),
      ]);
      const tasksBody = (await tasksResponse.json()) as { tasks?: OperationTask[]; error?: string };
      if (!tasksResponse.ok) throw new Error(tasksBody.error || "Falha ao consultar tarefas.");
      setTasks(tasksBody.tasks || []);
      if (usersResponse.ok) {
        const usersBody = (await usersResponse.json()) as { users?: Array<{ id: string; display_name: string }> };
        setUsers((usersBody.users || []).map((user) => ({ id: user.id, displayName: user.display_name })));
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao consultar tarefas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => tasks.filter((task) => {
    if (status !== "all" && task.status !== status) return false;
    if (priority !== "all" && task.priority !== priority) return false;
    const haystack = `${task.title} ${task.description} ${task.assignedToName || ""}`.toLowerCase();
    return !query.trim() || haystack.includes(query.trim().toLowerCase());
  }), [tasks, status, priority, query]);

  const counts = useMemo(() => ({
    open: tasks.filter((task) => task.status === "open").length,
    progress: tasks.filter((task) => task.status === "in_progress").length,
    blocked: tasks.filter((task) => task.status === "blocked").length,
    overdue: tasks.filter((task) => task.dueAt && new Date(task.dueAt).getTime() < Date.now() && !["completed", "cancelled"].includes(task.status)).length,
  }), [tasks]);

  async function createTask(event: React.FormEvent) {
    event.preventDefault();
    if (form.title.trim().length < 2) return;
    setWorking("create");
    setMessage("");
    try {
      let task: OperationTask;
      if (isDemoMode()) {
        const assignee = users.find((user) => user.id === form.assignedTo);
        task = { id: uid("task"), title: form.title.trim(), description: form.description.trim(), priority: form.priority, status: "open", assignedTo: form.assignedTo || undefined, assignedToName: assignee?.displayName, dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : undefined, createdBy: "Gestor Demo", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      } else {
        const response = await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: form.title.trim(), description: form.description.trim(), priority: form.priority, assignedTo: form.assignedTo || null, dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null }) });
        const body = (await response.json()) as { task?: OperationTask; error?: string };
        if (!response.ok || !body.task) throw new Error(body.error || "Falha ao criar tarefa.");
        task = { ...body.task, assignedToName: users.find((user) => user.id === form.assignedTo)?.displayName };
      }
      setTasks((current) => [task, ...current]);
      setForm({ title: "", description: "", priority: "normal", assignedTo: "", dueAt: "" });
      setModal(false);
      setMessage("Tarefa criada e registrada no histórico operacional.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao criar tarefa.");
    } finally {
      setWorking(null);
    }
  }

  async function updateStatus(task: OperationTask, next: OperationTaskStatus) {
    setWorking(task.id);
    setMessage("");
    try {
      if (!isDemoMode()) {
        const response = await fetch(`/api/tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) });
        const body = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(body.error || "Falha ao atualizar tarefa.");
      }
      const now = new Date().toISOString();
      setTasks((current) => current.map((item) => item.id === task.id ? { ...item, status: next, updatedAt: now, completedAt: next === "completed" ? now : undefined } : item));
      setMessage(`Tarefa marcada como ${taskStatusLabels[next].toLowerCase()}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao atualizar tarefa.");
    } finally {
      setWorking(null);
    }
  }

  return (
    <>
      <PageHeader title="Tarefas da equipe" icon={ClipboardCheck} description="Organize pendências operacionais com responsável, prioridade, prazo, origem e histórico de conclusão." actions={<><button className="btn-secondary" onClick={load}><RefreshCw size={17} />Atualizar</button><button className="btn-primary" onClick={() => setModal(true)}><Plus size={17} />Nova tarefa</button></>} />
      {message && <p className={`mb-5 rounded-2xl p-4 text-sm font-semibold ${/falha|erro/i.test(message) ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{message}</p>}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><TaskMetric label="Abertas" value={counts.open} icon={CircleDot} tone="blue" /><TaskMetric label="Em andamento" value={counts.progress} icon={PlayCircle} tone="amber" /><TaskMetric label="Bloqueadas" value={counts.blocked} icon={Ban} tone="red" /><TaskMetric label="Atrasadas" value={counts.overdue} icon={CalendarClock} tone="red" /></div>
      <section className="surface mb-5 grid gap-3 p-4 md:grid-cols-[1fr_180px_180px]"><label className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30" size={17} /><input className="input pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar título, descrição ou responsável" /></label><select className="input" value={status} onChange={(event) => setStatus(event.target.value as OperationTaskStatus | "all")}><option value="all">Todos os status</option>{Object.entries(taskStatusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><select className="input" value={priority} onChange={(event) => setPriority(event.target.value as NotificationPriority | "all")}><option value="all">Todas as prioridades</option><option value="urgent">Urgente</option><option value="high">Alta</option><option value="normal">Normal</option><option value="low">Baixa</option></select></section>
      {loading && <div className="surface grid min-h-56 place-items-center"><Loader2 className="animate-spin text-basso-wine" size={34} /></div>}
      {!loading && <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">{filtered.map((task) => <TaskCard key={task.id} task={task} working={working === task.id} onStatus={updateStatus} />)}{!filtered.length && <div className="surface col-span-full grid min-h-56 place-items-center text-center"><div><Filter className="mx-auto text-black/20" size={34} /><p className="mt-3 font-bold">Nenhuma tarefa encontrada</p><p className="text-sm text-black/45">Ajuste os filtros ou crie uma nova tarefa.</p></div></div>}</div>}
      <Modal open={modal} onClose={() => setModal(false)} title="Nova tarefa operacional"><form onSubmit={createTask} className="space-y-4 p-5"><label><span className="label">Título</span><input className="input" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Ex.: Conferir estoque de refrigerantes" required /></label><label><span className="label">Descrição</span><textarea className="textarea" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Explique o resultado esperado e qualquer contexto necessário" /></label><div className="grid gap-4 sm:grid-cols-2"><label><span className="label">Prioridade</span><select className="input" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as NotificationPriority })}><option value="urgent">Urgente</option><option value="high">Alta</option><option value="normal">Normal</option><option value="low">Baixa</option></select></label><label><span className="label">Responsável</span><select className="input" value={form.assignedTo} onChange={(event) => setForm({ ...form, assignedTo: event.target.value })}><option value="">Equipe / não atribuído</option>{users.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}</select></label></div><label><span className="label">Prazo</span><input type="datetime-local" className="input" value={form.dueAt} onChange={(event) => setForm({ ...form, dueAt: event.target.value })} /></label><div className="flex justify-end gap-2 border-t pt-4"><button type="button" className="btn-secondary" onClick={() => setModal(false)}>Cancelar</button><button type="submit" className="btn-primary" disabled={working === "create"}>{working === "create" ? <Loader2 className="animate-spin" size={17} /> : <Plus size={17} />}Criar tarefa</button></div></form></Modal>
    </>
  );
}

function TaskMetric({ label, value, icon: Icon, tone }: { label: string; value: number; icon: LucideIcon; tone: "blue" | "amber" | "red" }) { const colors = tone === "blue" ? "bg-blue-50 text-blue-700" : tone === "amber" ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-700"; return <div className="surface flex items-center gap-3 p-4"><span className={`grid h-10 w-10 place-items-center rounded-xl ${colors}`}><Icon size={19} /></span><div><strong className="block text-2xl">{value}</strong><span className="text-xs text-black/45">{label}</span></div></div>; }

function TaskCard({ task, working, onStatus }: { task: OperationTask; working: boolean; onStatus: (task: OperationTask, status: OperationTaskStatus) => void }) {
  const overdue = task.dueAt && new Date(task.dueAt).getTime() < Date.now() && !["completed", "cancelled"].includes(task.status);
  const priorityClass = task.priority === "urgent" ? "bg-red-100 text-red-700" : task.priority === "high" ? "bg-amber-100 text-amber-800" : task.priority === "low" ? "bg-stone-100 text-stone-500" : "bg-blue-50 text-blue-700";
  return <article className={`surface p-5 ${overdue ? "border-red-200" : ""}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="font-display text-xl font-bold">{task.title}</h2><p className="mt-2 text-sm leading-relaxed text-black/50">{task.description || "Sem descrição adicional."}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${priorityClass}`}>{task.priority}</span></div><div className="mt-4 grid gap-2 rounded-2xl bg-basso-paper p-3 text-xs text-black/55 sm:grid-cols-2"><p className="flex items-center gap-2"><UserRound size={14} />{task.assignedToName || "Equipe"}</p><p className={`flex items-center gap-2 ${overdue ? "font-bold text-red-600" : ""}`}><CalendarClock size={14} />{task.dueAt ? shortDateTime(task.dueAt) : "Sem prazo"}</p><p className="flex items-center gap-2"><CircleDot size={14} />{taskStatusLabels[task.status]}</p><p className="flex items-center gap-2"><RefreshCw size={14} />{shortDateTime(task.updatedAt)}</p></div><div className="mt-4 flex flex-wrap gap-2">{task.status === "open" && <button className="btn-secondary min-h-9 px-3 text-xs" disabled={working} onClick={() => onStatus(task, "in_progress")}><PlayCircle size={15} />Iniciar</button>}{["open", "in_progress", "blocked"].includes(task.status) && <button className="btn-primary min-h-9 px-3 text-xs" disabled={working} onClick={() => onStatus(task, "completed")}>{working ? <Loader2 className="animate-spin" size={15} /> : <CheckCircle2 size={15} />}Concluir</button>}{["open", "in_progress"].includes(task.status) && <button className="btn-secondary min-h-9 px-3 text-xs" disabled={working} onClick={() => onStatus(task, "blocked")}><Ban size={15} />Bloquear</button>}{!task.status.includes("cancelled") && task.status !== "completed" && <button className="btn-ghost min-h-9 px-3 text-xs" disabled={working} onClick={() => onStatus(task, "cancelled")}><XCircle size={15} />Cancelar</button>}</div></article>;
}
