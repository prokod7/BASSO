import { compactItemName, itemDetails } from '@/lib/item-presentation';
import { currency } from '@/lib/utils';
import type { DemoTab } from '@/types';
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
export function tabPrebillHtml(tableNumber: number, tab: DemoTab, serviceApplied = tab.serviceChargeApplied !== false) {
  const service = serviceApplied ? Math.round(tab.totalCents * ((tab.serviceChargeRate ?? 10) / 100)) : 0;
  const total = tab.totalCents + service;
  const items = tab.items.filter(item => (item as {productionStatus?:string}).productionStatus !== 'cancelled').map(item => `<section><strong>${item.quantity}× ${escapeHtml(compactItemName(item))}</strong><span>${currency(item.quantity * item.unitPrice)}</span>${itemDetails(item).map(line=>`<small>${escapeHtml(line.text)}</small>`).join('')}</section>`).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Pré-conta Mesa ${tableNumber}</title><style>@page{size:80mm auto;margin:3mm}body{max-width:74mm;margin:auto;font:12px monospace;color:#000}h1{font-size:18px}section{border-bottom:1px dashed;padding:8px 0}section span{float:right}small{display:block;white-space:pre-wrap;margin-top:3px}.sum{display:flex;justify-content:space-between;margin:7px 0}@media print{button{display:none}}</style></head><body><h1>LA FORNERIA BASSO</h1><h2>PRÉ-CONTA • Mesa ${tableNumber}</h2><p>${escapeHtml(tab.name)}</p>${items}<div class="sum"><span>Consumo</span><strong>${currency(tab.totalCents)}</strong></div><div class="sum"><span>Serviço ${serviceApplied ? tab.serviceChargeRate ?? 10 : 0}%</span><strong>${currency(service)}</strong></div><div class="sum"><span>Total</span><strong>${currency(total)}</strong></div><div class="sum"><span>Já pago</span><strong>${currency(tab.paidCents)}</strong></div><div class="sum"><span>Saldo</span><strong>${currency(Math.max(0,total-tab.paidCents))}</strong></div><p>PRÉ-CONTA — confira o consumo antes do pagamento.</p><button onclick="window.print()">Imprimir</button><script>window.addEventListener('load',()=>window.print());<\/script></body></html>`;
}
export function printTabPrebill(tableNumber: number, tab: DemoTab, serviceApplied?: boolean) {
  const popup = window.open('', '_blank', 'width=460,height=760');
  if (!popup) throw new Error('O navegador bloqueou a pré-conta. Permita pop-ups e tente novamente.');
  popup.document.open();
  popup.document.write(tabPrebillHtml(tableNumber, tab, serviceApplied));
  popup.document.close();
}
