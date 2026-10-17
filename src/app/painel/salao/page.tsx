"use client";

import { tabBalance } from "@/lib/operational-totals";
import { printTabPrebill } from "@/lib/tab-prebill";
import { FormEvent, useEffect, useState } from "react";
import { Clock3, CreditCard, Loader2, Plus, Printer, QrCode, Table2, Users } from "lucide-react";
import { PageHeader } from "@/components/internal/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { demoActions, useDemoState } from "@/lib/demo-store";
import { apiJson, formatApiError, requestOperationalRefresh } from "@/lib/client/api";
import { currency, isDemoMode, shortDateTime, uid } from "@/lib/utils";
import type { DemoTable, PaymentMethod } from "@/types";

const statusText = { free: "Livre", occupied: "Ocupada", cleaning: "Aguardando limpeza", partial: "Parcialmente paga" };
const statusStyle = { free: "border-emerald-200 bg-emerald-50", occupied: "border-basso-wine/30 bg-white", cleaning: "border-amber-200 bg-amber-50", partial: "border-blue-200 bg-blue-50" };

export default function SalaoPage() {
  const tables = useDemoState((state) => state.tables);
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  useEffect(() => {
    const number = Number(new URLSearchParams(window.location.search).get("mesa"));
    if (Number.isInteger(number) && number >= 1 && number <= 15) setSelectedNumber(number);
  }, []);
  const selected = tables.find((table) => table.number === selectedNumber) || null;

  return <>
    <PageHeader title="Salão, mesas e comandas" icon={Table2} description="Mapa das 15 mesas com ações persistidas no servidor: comandas, transferências, união/separação e divisão flexível do pagamento." />
    <div className="mb-4 flex flex-wrap gap-3 text-xs">{Object.entries(statusText).map(([key, value]) => <span key={key} className={`rounded-full border px-3 py-1.5 ${statusStyle[key as keyof typeof statusStyle]}`}>{value}</span>)}</div>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {tables.map((table) => <button key={table.number} onClick={() => setSelectedNumber(table.number)} className={`min-h-44 rounded-3xl border p-5 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-premium ${statusStyle[table.status]}`}>
        <div className="flex items-center justify-between"><span className="font-display text-3xl font-black">{table.number}</span><Table2 className="text-basso-wine" /></div>
        <p className="mt-4 text-sm font-bold">{statusText[table.status]}</p>
        <div className="mt-2 flex items-center gap-1 text-xs text-black/45"><Users size={14} />{table.capacity} lugares{table.people ? ` • ${table.people} pessoas` : ""}</div>
        {table.openedAt && <div className="mt-1 flex items-center gap-1 text-xs text-black/45"><Clock3 size={14} />{shortDateTime(table.openedAt)}</div>}
        <p className="mt-3 text-xs font-semibold text-basso-wine">{table.tabs.filter(tab=>tab.status==="open"||tab.status==="partial").length} comanda(s){table.groupId ? " • mesa unida" : ""}</p>
      </button>)}
    </div>
    <TableModal table={selected} allTables={tables} onClose={() => setSelectedNumber(null)} />
  </>;
}

function TableModal({ table, allTables, onClose }: { table: DemoTable | null; allTables: DemoTable[]; onClose: () => void }) {
  const [name, setName] = useState("");
  const [people, setPeople] = useState("1");
  const [tabMode,setTabMode]=useState<"individual"|"shared">("individual");
  const [selectedTab, setSelectedTab] = useState("");
  const [target, setTarget] = useState("1");
  const [payAmount, setPayAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("pix");
  const [serviceChargeApplied, setServiceChargeApplied] = useState(true);
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState("");

  useEffect(() => {
    if (table) {
      setTarget(String(allTables.find((item) => item.number !== table.number)?.number || 1));
      setSelectedTab(previous=>table.tabs.some(t=>t.id===previous&&(t.status==="open"||t.status==="partial"))?previous:(table.tabs.find(t=>t.status==="open"||t.status==="partial")?.id||""));
      setMessage("");
      const selected = table.tabs.find(t=>t.id===selectedTab)||table.tabs.find(t=>t.status==="open"||t.status==="partial");
      setServiceChargeApplied(selected?.serviceChargeApplied !== false);
    }
  }, [table?.number, table?.tabs.length, allTables]);

  if (!table) return null;
  const current = table;
  const tab = current.tabs.find((item) => item.id === selectedTab && (item.status==="open"||item.status==="partial"));

  async function afterMutation(messageText: string) {
    if (!isDemoMode()) requestOperationalRefresh();
    setMessage(messageText);
  }

  async function openTab(event: FormEvent) {
    event.preventDefault();
    const tabName=name.trim()||(tabMode==="shared"?`Mesa ${current.number}`:"");
    if (tabName.length < 1) { setMessage("Informe o nome da comanda."); return; }
    setWorking("open"); setMessage("");
    try {
      let id: string;
      if (isDemoMode()) {
        id = demoActions.openTab(current.number, tabName, tabMode==="individual"?1:Math.max(1, Number(people) || 1));
      } else {
        const body = await apiJson<{ id: string }>(`/api/tables/${current.number}/tabs`, {
          method: "POST",
          body: JSON.stringify({ name: tabName, people: tabMode==="individual"?1:Math.max(1, Number(people) || 1) }),
        });
        id = body.id;
        requestOperationalRefresh();
      }
      setSelectedTab(id);
      setName("");
      setMessage("Comanda aberta e vinculada à mesa.");
    } catch (error) { setMessage(formatApiError(error, "Falha ao abrir comanda.")); }
    finally { setWorking(""); }
  }

  async function transfer() {
    if (!tab) return;
    const number = Number(target);
    if (number === current.number) { setMessage("Escolha outra mesa."); return; }
    setWorking("transfer"); setMessage("");
    try {
      if (isDemoMode()) demoActions.transferTab(tab.id, number);
      else await apiJson(`/api/tabs/${tab.id}`, { method: "PATCH", body: JSON.stringify({ action: "transfer", targetTable: number }) });
      await afterMutation(`Comanda transferida para a mesa ${number}.`);
    } catch (error) { setMessage(formatApiError(error, "Falha ao transferir comanda.")); }
    finally { setWorking(""); }
  }

  async function toggleServiceCharge(applied: boolean) {
    if (!tab) return;
    setWorking("service"); setMessage("");
    try {
      if (!isDemoMode()) {
        await apiJson(`/api/tabs/${tab.id}/service-charge`, { method: "PATCH", body: JSON.stringify({ applied }) });
        requestOperationalRefresh();
      }
      setServiceChargeApplied(applied);
      setMessage(applied ? "Taxa de serviço incluída." : "Taxa de serviço retirada desta comanda.");
    } catch (error) { setMessage(formatApiError(error, "Falha ao alterar taxa de serviço.")); }
    finally { setWorking(""); }
  }

  async function pay() {
    if (!tab) return;
    const cents = Math.round(Number(payAmount.replace(",", ".")) * 100);
    const outstanding = tabBalance({ ...tab, serviceChargeApplied });
    if (!Number.isFinite(cents) || cents <= 0 || cents > outstanding) { setMessage("Informe um valor válido, sem exceder o saldo."); return; }
    setWorking("pay"); setMessage("");
    try {
      if (isDemoMode()) demoActions.payTab(tab.id, cents, method);
      else await apiJson(`/api/tabs/${tab.id}/payments`, {
        method: "POST",
        body: JSON.stringify({ amount: cents, method, idempotencyKey: uid("tabpay") }),
      });
      setPayAmount("");
      await afterMutation("Pagamento registrado e confirmado pelo servidor.");
    } catch (error) { setMessage(formatApiError(error, "Falha ao registrar pagamento.")); }
    finally { setWorking(""); }
  }

  async function group() {
    const number = Number(target);
    if (number === current.number) { setMessage("Escolha outra mesa."); return; }
    setWorking("group"); setMessage("");
    try {
      if (isDemoMode()) demoActions.groupTables([current.number, number]);
      else await apiJson("/api/tables/groups", { method: "POST", body: JSON.stringify({ tableNumbers: [current.number, number] }) });
      await afterMutation(`Mesas ${current.number} e ${number} unidas.`);
    } catch (error) { setMessage(formatApiError(error, "Falha ao unir mesas.")); }
    finally { setWorking(""); }
  }

  async function ungroup() {
    setWorking("ungroup"); setMessage("");
    try {
      if (isDemoMode()) demoActions.ungroupTable(current.number);
      else await apiJson(`/api/tables/${current.number}/group`, { method: "DELETE" });
      await afterMutation("Mesa separada do grupo.");
    } catch (error) { setMessage(formatApiError(error, "Falha ao separar mesa.")); }
    finally { setWorking(""); }
  }

  async function toggleTable() {
    const nextStatus = current.status === "free" ? "occupied" : "free";
    setWorking("table"); setMessage("");
    try {
      if (isDemoMode()) demoActions.setTableStatus(current.number, nextStatus, nextStatus === "occupied" ? 1 : undefined);
      else await apiJson(`/api/tables/${current.number}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus, people: nextStatus === "occupied" ? 1 : 0 }),
      });
      await afterMutation(nextStatus === "occupied" ? "Mesa aberta." : "Mesa fechada.");
    } catch (error) { setMessage(formatApiError(error, "Falha ao atualizar mesa.")); }
    finally { setWorking(""); }
  }

  return <Modal open={!!table} onClose={onClose} title={`Mesa ${current.number}`}>
    <div className="space-y-5 p-5">
      <div className="grid grid-cols-2 gap-3"><Info label="Capacidade" value={`${current.capacity} lugares`} /><Info label="Status" value={statusText[current.status]} /></div>
      {current.groupId && <p className="rounded-xl bg-blue-50 p-3 text-sm font-semibold text-blue-800">Esta mesa está unida a outra mesa. <button className="underline" disabled={working === "ungroup"} onClick={ungroup}>{working === "ungroup" ? "Separando..." : "Separar agora"}</button></p>}
      <div className="grid grid-cols-2 gap-2"><button type="button" className={tabMode==="individual"?"btn-primary":"btn-secondary"} onClick={()=>{setTabMode("individual");setPeople("1")}}>Comanda individual</button><button type="button" className={tabMode==="shared"?"btn-primary":"btn-secondary"} onClick={()=>setTabMode("shared")}>Conta da mesa</button></div><p className="text-sm text-black/50">Uma comanda por pessoa, com pedidos e pagamento separados. Informe um nome ou número.</p><form onSubmit={openTab} className="rounded-2xl border p-4">
        <p className="label">Abrir nova comanda</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_90px_auto]"><input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder={tabMode==="individual"?"Nome da pessoa ou nº da comanda":"Nome da mesa (opcional)"} maxLength={120} /><input aria-label="Pessoas na comanda" disabled={tabMode==="individual"} className="input" type="number" min="1" max={20} value={people} onChange={(event) => setPeople(event.target.value)} /><button type="submit" className="btn-primary" disabled={!!working}>{working === "open" ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}Abrir</button></div>
      </form>
      <section>
        <p className="label">Comandas</p>
        <div className="space-y-2">{current.tabs.filter(item=>item.status==="open"||item.status==="partial").map((item) => <button key={item.id} onClick={() => { setSelectedTab(item.id); setServiceChargeApplied(item.serviceChargeApplied !== false); }} className={`w-full rounded-xl border p-3 text-left ${selectedTab === item.id ? "border-basso-wine bg-basso-wine/5" : ""}`}><div className="flex justify-between"><strong>{item.name}</strong><span className="text-xs text-black/45">{item.waiter}</span></div><p className="mt-1 text-xs text-black/45">{item.items.length} item(ns) • {currency(item.paidCents)} pago de {currency(item.totalCents)}</p></button>)}{!current.tabs.length && <p className="rounded-xl bg-basso-paper p-4 text-sm text-black/45">Nenhuma comanda aberta.</p>}</div>
      </section>
      {tab && <section className="rounded-2xl border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="label">Comanda selecionada</p><h3 className="font-display text-xl font-bold">{tab.name}</h3></div><div className="text-right"><p className="text-xs text-black/45">Saldo</p><strong className="text-lg text-basso-wine">{currency(tabBalance({ ...tab, serviceChargeApplied }))}</strong></div></div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2"><select className="input" value={target} onChange={(event) => setTarget(event.target.value)}>{allTables.filter((item) => item.number !== current.number).map((item) => <option key={item.number} value={item.number}>Mesa {item.number}</option>)}</select><button className="btn-secondary" disabled={!!working} onClick={transfer}>{working === "transfer" ? "Transferindo..." : "Transferir comanda"}</button><button className="btn-secondary" disabled={!!working} onClick={group}>{working === "group" ? "Unindo..." : "Unir com a mesa escolhida"}</button><button className="btn-secondary" disabled={!!working} onClick={() => { try { printTabPrebill(current.number, tab, serviceChargeApplied); } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao emitir pré-conta."); } }}><Printer size={16} />Emitir pré-conta</button></div>
        <div className="mt-4 rounded-xl bg-basso-paper p-3"><label className="flex items-center justify-between gap-3 text-sm font-semibold"><span><strong>Taxa de serviço {tab.serviceChargeRate ?? 10}%</strong><span className="mt-0.5 block text-xs font-normal text-black/45">{serviceChargeApplied ? `Incluída: ${currency(Math.round(tab.totalCents * ((tab.serviceChargeRate ?? 10) / 100)))}` : "Retirada no pagamento"}</span></span><input type="checkbox" checked={serviceChargeApplied} disabled={!!working} onChange={e=>void toggleServiceCharge(e.target.checked)}/></label></div>
        <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_140px_auto]"><input className="input" value={payAmount} onChange={(event) => setPayAmount(event.target.value)} placeholder="Valor a receber" inputMode="decimal" /><select className="input" value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}><option value="pix">Pix</option><option value="cash">Dinheiro</option><option value="debit">Débito</option><option value="credit">Crédito</option></select><button className="btn-primary" onClick={pay} disabled={!!working || tabBalance({ ...tab, serviceChargeApplied }) <= 0}>{working === "pay" ? <Loader2 className="animate-spin" size={16} /> : <CreditCard size={16} />}Receber</button></div>
      </section>}
      <div className="grid gap-2 sm:grid-cols-2"><button className="btn-secondary" disabled={!!working} onClick={toggleTable}>{working === "table" ? <Loader2 className="animate-spin" size={16} /> : null}{current.status === "free" ? "Abrir mesa sem comanda" : "Fechar mesa"}</button><a href={`/mesa/${current.number}`} target="_blank" rel="noreferrer" className="btn-secondary"><QrCode size={17} />Abrir QR da mesa</a></div>
      {message && <p className="rounded-xl bg-blue-50 p-3 text-sm font-semibold text-blue-800">{message}</p>}
    </div>
  </Modal>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-basso-paper p-3"><p className="text-[10px] font-bold uppercase text-black/40">{label}</p><p className="mt-1 font-bold">{value}</p></div>;
}

