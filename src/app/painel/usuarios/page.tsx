"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Edit3,
  KeyRound,
  LockKeyhole,
  Plus,
  Save,
  ShieldCheck,
  ToggleLeft,
  ToggleRight,
  UserCog,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/internal/PageHeader";
import { isDemoMode, shortDateTime, uid } from "@/lib/utils";

type Role = "manager" | "counter" | "waiter" | "kitchen" | "bar" | "driver" | "finance" | "viewer";
type UserRow = {
  id: string;
  display_name: string;
  role: Role;
  active: boolean;
  device_limit: number;
  permissions?: Record<string, boolean>;
  email: string;
  lastSignInAt?: string;
};

type PermissionKey =
  | "orders.view"
  | "orders.edit"
  | "orders.cancel"
  | "orders.discount"
  | "payments.manage"
  | "tables.manage"
  | "kds.manage"
  | "delivery.manage"
  | "menu.manage"
  | "customers.manage"
  | "loyalty.authorize"
  | "inventory.manage"
  | "cash.manage"
  | "finance.view"
  | "reports.view"
  | "users.manage"
  | "audit.view"
  | "settings.manage";

const roleLabel: Record<Role, string> = {
  manager: "Gestor",
  counter: "Atendente",
  waiter: "Garçom",
  kitchen: "Cozinha",
  bar: "Bar",
  driver: "Motoboy",
  finance: "Financeiro",
  viewer: "Consulta",
};

const roleScope: Record<Role, string> = {
  manager: "Acesso total",
  counter: "PDV, pedidos, salão e delivery",
  waiter: "Salão, comandas e pedidos das mesas",
  kitchen: "Produção da cozinha",
  bar: "Produção do bar",
  driver: "Entregas atribuídas",
  finance: "Caixa, financeiro e relatórios",
  viewer: "Consulta operacional",
};

const permissionLabels: Array<{ key: PermissionKey; label: string; group: string }> = [
  { key: "orders.view", label: "Visualizar pedidos", group: "Pedidos" },
  { key: "orders.edit", label: "Editar pedidos e itens", group: "Pedidos" },
  { key: "orders.cancel", label: "Cancelar ou reabrir pedidos", group: "Pedidos" },
  { key: "orders.discount", label: "Aplicar desconto e alterar taxa", group: "Pedidos" },
  { key: "payments.manage", label: "Receber, corrigir e estornar pagamentos", group: "Pagamentos" },
  { key: "tables.manage", label: "Administrar mesas e comandas", group: "Salão" },
  { key: "kds.manage", label: "Administrar produção e KDS", group: "Produção" },
  { key: "delivery.manage", label: "Despachar e concluir entregas", group: "Delivery" },
  { key: "menu.manage", label: "Editar cardápio e disponibilidade", group: "Cadastros" },
  { key: "customers.manage", label: "Editar CRM e clientes", group: "Cadastros" },
  { key: "loyalty.authorize", label: "Autorizar recompensa interna", group: "Cadastros" },
  { key: "inventory.manage", label: "Movimentar estoque", group: "Gestão" },
  { key: "cash.manage", label: "Abrir, movimentar e fechar caixa", group: "Gestão" },
  { key: "finance.view", label: "Acessar financeiro", group: "Gestão" },
  { key: "reports.view", label: "Acessar relatórios", group: "Gestão" },
  { key: "users.manage", label: "Gerenciar usuários", group: "Administração" },
  { key: "audit.view", label: "Consultar auditoria", group: "Administração" },
  { key: "settings.manage", label: "Alterar configurações", group: "Administração" },
];

const defaultPermissions: Record<Role, Record<PermissionKey, boolean>> = {
  manager: Object.fromEntries(permissionLabels.map(({ key }) => [key, true])) as Record<PermissionKey, boolean>,
  counter: {
    "orders.view": true, "orders.edit": true, "orders.cancel": false, "orders.discount": false,
    "payments.manage": true, "tables.manage": true, "kds.manage": true, "delivery.manage": true,
    "menu.manage": false, "customers.manage": true, "loyalty.authorize": false, "inventory.manage": false,
    "cash.manage": true, "finance.view": false, "reports.view": false, "users.manage": false,
    "audit.view": false, "settings.manage": false,
  },
  waiter: {
    "orders.view": true, "orders.edit": true, "orders.cancel": false, "orders.discount": false,
    "payments.manage": true, "tables.manage": true, "kds.manage": false, "delivery.manage": false,
    "menu.manage": false, "customers.manage": false, "loyalty.authorize": false, "inventory.manage": false,
    "cash.manage": false, "finance.view": false, "reports.view": false, "users.manage": false,
    "audit.view": false, "settings.manage": false,
  },
  kitchen: {
    "orders.view": true, "orders.edit": false, "orders.cancel": false, "orders.discount": false,
    "payments.manage": false, "tables.manage": false, "kds.manage": true, "delivery.manage": false,
    "menu.manage": false, "customers.manage": false, "loyalty.authorize": false, "inventory.manage": false,
    "cash.manage": false, "finance.view": false, "reports.view": false, "users.manage": false,
    "audit.view": false, "settings.manage": false,
  },
  bar: {
    "orders.view": true, "orders.edit": false, "orders.cancel": false, "orders.discount": false,
    "payments.manage": false, "tables.manage": false, "kds.manage": true, "delivery.manage": false,
    "menu.manage": false, "customers.manage": false, "loyalty.authorize": false, "inventory.manage": true,
    "cash.manage": false, "finance.view": false, "reports.view": false, "users.manage": false,
    "audit.view": false, "settings.manage": false,
  },
  driver: {
    "orders.view": true, "orders.edit": false, "orders.cancel": false, "orders.discount": false,
    "payments.manage": false, "tables.manage": false, "kds.manage": false, "delivery.manage": true,
    "menu.manage": false, "customers.manage": false, "loyalty.authorize": false, "inventory.manage": false,
    "cash.manage": false, "finance.view": false, "reports.view": false, "users.manage": false,
    "audit.view": false, "settings.manage": false,
  },
  finance: {
    "orders.view": true, "orders.edit": false, "orders.cancel": false, "orders.discount": false,
    "payments.manage": true, "tables.manage": false, "kds.manage": false, "delivery.manage": false,
    "menu.manage": false, "customers.manage": false, "loyalty.authorize": false, "inventory.manage": false,
    "cash.manage": true, "finance.view": true, "reports.view": true, "users.manage": false,
    "audit.view": true, "settings.manage": false,
  },
  viewer: {
    "orders.view": true, "orders.edit": false, "orders.cancel": false, "orders.discount": false,
    "payments.manage": false, "tables.manage": false, "kds.manage": false, "delivery.manage": false,
    "menu.manage": false, "customers.manage": false, "loyalty.authorize": false, "inventory.manage": false,
    "cash.manage": false, "finance.view": false, "reports.view": true, "users.manage": false,
    "audit.view": false, "settings.manage": false,
  },
};

const initialUsers: UserRow[] = [
  { id: "demo_manager", display_name: "Gestor", email: "gestor@laforneriabasso.com.br", role: "manager", active: true, device_limit: 3, permissions: defaultPermissions.manager },
  { id: "demo_counter_1", display_name: "Atendente 1", email: "atendente1@laforneriabasso.com.br", role: "counter", active: true, device_limit: 3, permissions: defaultPermissions.counter },
  { id: "demo_waiter_1", display_name: "Garçom 1", email: "garcom1@laforneriabasso.com.br", role: "waiter", active: true, device_limit: 2, permissions: defaultPermissions.waiter },
];

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>(initialUsers);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [message, setMessage] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("counter");
  const [password, setPassword] = useState("");

  const stats = useMemo(() => ({
    active: users.filter((user) => user.active).length,
    blocked: users.filter((user) => !user.active).length,
    managers: users.filter((user) => user.role === "manager" && user.active).length,
  }), [users]);

  async function load() {
    setLoading(true);
    try {
      if (!isDemoMode()) {
        const response = await fetch("/api/users", { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Falha ao carregar usuários.");
        setUsers(body.users || []);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao carregar usuários.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    try {
      if (name.trim().length < 2 || !email.includes("@")) throw new Error("Informe nome e e-mail válidos.");
      let id = uid("user");
      let generated = password || "Gerada pelo ambiente de produção";
      if (!isDemoMode()) {
        const response = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ displayName: name.trim(), email: email.trim().toLowerCase(), role, password: password || undefined, active: true }),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Falha ao criar usuário.");
        id = body.id;
        generated = body.temporaryPassword || "Senha definida pelo gestor";
      }
      const created: UserRow = {
        id,
        display_name: name.trim(),
        email: email.trim().toLowerCase(),
        role,
        active: true,
        device_limit: 3,
        permissions: defaultPermissions[role],
      };
      setUsers((list) => [created, ...list]);
      setTemporaryPassword(generated);
      setName(""); setEmail(""); setPassword(""); setRole("counter"); setCreating(false);
      setMessage("Usuário criado. A senha temporária deve ser entregue por canal seguro.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao criar usuário.");
    }
  }

  async function patchUser(user: UserRow, patch: Partial<UserRow> & { password?: string }) {
    if (!isDemoMode()) {
      const response = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: patch.display_name,
          role: patch.role,
          active: patch.active,
          deviceLimit: patch.device_limit,
          permissions: patch.permissions,
          password: patch.password || undefined,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Falha ao alterar usuário.");
    }
    setUsers((list) => list.map((item) => item.id === user.id ? { ...item, ...patch } : item));
  }

  async function toggle(user: UserRow) {
    try {
      await patchUser(user, { active: !user.active });
      setMessage(user.active ? "Usuário bloqueado e novas operações impedidas." : "Usuário reativado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao alterar usuário.");
    }
  }

  return <>
    <PageHeader
      title="Usuários, perfis e segurança"
      icon={UserCog}
      description="Controle contas, perfis, permissões específicas, limite de dispositivos, bloqueio e redefinição de senha. Toda alteração sensível entra na auditoria."
      actions={<button className="btn-primary" onClick={() => setCreating(true)}><Plus size={17} />Novo usuário</button>}
    />

    {message && <p className="mb-4 rounded-xl bg-blue-50 p-4 text-sm font-semibold text-blue-800">{message}</p>}
    {temporaryPassword && <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <p className="text-xs font-black uppercase text-amber-900">Senha temporária exibida uma única vez</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <code className="rounded-lg bg-white px-3 py-2 font-bold">{temporaryPassword}</code>
        <button className="btn-ghost" onClick={() => navigator.clipboard?.writeText(temporaryPassword)}><KeyRound size={16} />Copiar</button>
        <button className="btn-ghost" onClick={() => setTemporaryPassword("")}>Ocultar</button>
      </div>
    </div>}

    <div className="mb-5 grid gap-4 sm:grid-cols-3">
      <Metric label="Usuários ativos" value={stats.active} />
      <Metric label="Bloqueados" value={stats.blocked} />
      <Metric label="Gestores ativos" value={stats.managers} />
    </div>

    <div className="grid gap-4 lg:grid-cols-2">
      {users.map((user) => <article key={user.id} className="surface p-5">
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-basso-cream text-basso-wine"><UserCog /></div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <strong>{user.display_name}</strong>
              <span className="rounded-full bg-black/5 px-2 py-1 text-[10px] font-bold">{roleLabel[user.role]}</span>
              <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${user.active ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{user.active ? "Ativo" : "Bloqueado"}</span>
            </div>
            <p className="mt-1 truncate text-xs text-black/45">{user.email}</p>
            <p className="mt-1 text-xs text-black/45">{roleScope[user.role]} • até {user.device_limit} dispositivo(s)</p>
            <p className="mt-1 text-xs text-black/35">Último acesso: {user.lastSignInAt ? shortDateTime(user.lastSignInAt) : "ainda não registrado"}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
          <button className="btn-secondary" onClick={() => setEditing({ ...user, permissions: { ...defaultPermissions[user.role], ...(user.permissions || {}) } })}><Edit3 size={16} />Administrar acesso</button>
          <button className="btn-ghost" title={user.active ? "Bloquear" : "Reativar"} onClick={() => void toggle(user)}>{user.active ? <><ToggleRight className="text-emerald-600" />Bloquear</> : <><ToggleLeft className="text-red-600" />Reativar</>}</button>
        </div>
      </article>)}
      {!loading && !users.length && <p className="surface p-8 text-center text-sm text-black/45 lg:col-span-2">Nenhum usuário cadastrado.</p>}
    </div>

    <div className="mt-6 grid gap-4 md:grid-cols-3">
      <Security icon={<ShieldCheck />} title="Menor privilégio" text="Cada perfil recebe apenas o necessário; permissões específicas podem restringir ainda mais." />
      <Security icon={<LockKeyhole />} title="Ações protegidas" text="Cancelamento, estorno, preço, caixa e administração exigem autorização." />
      <Security icon={<KeyRound />} title="Auditoria" text="Usuário, data, origem, motivo e alterações ficam registrados." />
    </div>

    {creating && <div className="fixed inset-0 z-[100] grid place-items-center bg-black/50 p-4">
      <form onSubmit={create} className="surface w-full max-w-lg p-6">
        <div className="flex items-center justify-between"><h2 className="font-display text-2xl font-bold">Novo usuário</h2><button type="button" onClick={() => setCreating(false)}><X /></button></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label><span className="label">Nome</span><input className="input" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} /></label>
          <label><span className="label">E-mail</span><input className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label><span className="label">Perfil</span><select className="input" value={role} onChange={(event) => setRole(event.target.value as Role)}>{Object.entries(roleLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span className="label">Senha inicial (opcional)</span><input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={12} placeholder="Gerar automaticamente" /></label>
        </div>
        <p className="mt-4 text-xs text-black/45">Sem senha informada, o sistema gera uma senha forte temporária.</p>
        <button type="submit" className="btn-primary mt-5 w-full">Criar usuário com auditoria</button>
      </form>
    </div>}

    {editing && <UserAccessModal
      user={editing}
      onClose={() => setEditing(null)}
      onSave={async (draft, newPassword) => {
        try {
          await patchUser(editing, { ...draft, password: newPassword || undefined });
          setEditing(null);
          setMessage("Perfil, permissões e limites atualizados com auditoria.");
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Falha ao salvar usuário.");
        }
      }}
    />}
  </>;
}

function UserAccessModal({ user, onClose, onSave }: { user: UserRow; onClose: () => void; onSave: (draft: UserRow, password: string) => Promise<void> }) {
  const [draft, setDraft] = useState<UserRow>({ ...user, permissions: { ...defaultPermissions[user.role], ...(user.permissions || {}) } });
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const groups = [...new Set(permissionLabels.map((item) => item.group))];

  function changeRole(next: Role) {
    setDraft({ ...draft, role: next, permissions: { ...defaultPermissions[next] } });
  }

  return <div className="fixed inset-0 z-[120] grid place-items-center bg-black/55 p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <div className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
      <div className="flex items-start justify-between">
        <div><p className="text-xs font-black uppercase text-basso-wine">Controle de acesso</p><h2 className="mt-1 font-display text-2xl font-bold">{draft.display_name}</h2><p className="text-xs text-black/45">{draft.email}</p></div>
        <button className="btn-ghost" onClick={onClose}><X /></button>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-4">
        <label className="sm:col-span-2"><span className="label">Nome exibido</span><input className="input" value={draft.display_name} onChange={(event) => setDraft({ ...draft, display_name: event.target.value })} /></label>
        <label><span className="label">Perfil base</span><select className="input" value={draft.role} onChange={(event) => changeRole(event.target.value as Role)}>{Object.entries(roleLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span className="label">Limite de dispositivos</span><input className="input" type="number" min={1} max={20} value={draft.device_limit} onChange={(event) => setDraft({ ...draft, device_limit: Number(event.target.value) || 1 })} /></label>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-4 rounded-2xl border p-4">
        <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} />Usuário ativo</label>
        <label className="min-w-[260px] flex-1"><span className="label">Nova senha (opcional)</span><input className="input" type="password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mínimo de 12 caracteres" /></label>
      </div>

      <div className="mt-6 space-y-5">
        {groups.map((group) => <section key={group}>
          <p className="label">{group}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {permissionLabels.filter((item) => item.group === group).map((item) => {
              const checked = draft.role === "manager" || Boolean(draft.permissions?.[item.key]);
              return <label key={item.key} className={`flex items-center gap-3 rounded-xl border p-3 text-sm font-semibold ${checked ? "border-emerald-200 bg-emerald-50" : "border-black/10"}`}>
                <input
                  type="checkbox"
                  disabled={draft.role === "manager"}
                  checked={checked}
                  onChange={(event) => setDraft({ ...draft, permissions: { ...(draft.permissions || {}), [item.key]: event.target.checked } })}
                />
                {item.label}
              </label>;
            })}
          </div>
        </section>)}
      </div>

      <div className="mt-6 rounded-xl bg-basso-paper p-4 text-xs text-black/55"><CheckCircle2 className="mr-2 inline text-emerald-700" size={16} />As permissões complementam o perfil base. O backend continua bloqueando ações fora do papel autorizado.</div>
      <button
        className="btn-primary mt-6 w-full"
        disabled={saving || draft.display_name.trim().length < 2 || (password.length > 0 && password.length < 12)}
        onClick={async () => { setSaving(true); try { await onSave(draft, password); } finally { setSaving(false); } }}
      ><Save size={17} />{saving ? "Salvando..." : "Salvar acesso e registrar auditoria"}</button>
    </div>
  </div>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="surface p-4"><p className="text-xs font-bold uppercase text-black/40">{label}</p><p className="mt-1 text-2xl font-black text-basso-wine">{value}</p></div>;
}

function Security({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <div className="surface p-5"><span className="text-basso-wine">{icon}</span><h2 className="mt-3 font-display text-lg font-bold">{title}</h2><p className="mt-1 text-sm text-black/50">{text}</p></div>;
}
