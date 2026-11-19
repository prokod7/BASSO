import { compactItemName, itemDetails } from "@/lib/item-presentation";
import { printableOrderNote } from "@/lib/print-note";
import type { CartItem } from "@/types";
export function presentPrintJob(job: any) {
  const payload = job.payload || {};
  const order = payload.order || {};
  return { ...job, payload: { ...payload,
    order: { ...order, number: order.daily_number ?? order.number, notes: printableOrderNote(order.notes) },
    items: (payload.items || []).map((row: any) => {
      const item = { ...row, name: row.name_snapshot || row.name || "Item" } as CartItem;
      return { ...row, display_name: compactItemName(item), detail_lines: itemDetails(item) };
    }),
  } };
}

export async function hydratePrintJobs(db: any, jobs: any[]) {
  const ids = [...new Set(jobs.map(job => job.order_id || job.payload?.order?.id).filter(Boolean))];
  if (!ids.length) return jobs.map(presentPrintJob);
  const { data, error } = await db.from("orders").select("id,daily_number").in("id", ids);
  if (error) throw error;
  const numbers = new Map((data || []).map((row: any) => [row.id, row.daily_number]));
  return jobs.map(job => presentPrintJob({ ...job, payload: { ...job.payload, order: {
    ...job.payload?.order,
    daily_number: numbers.get(job.order_id || job.payload?.order?.id) ?? job.payload?.order?.daily_number,
  } } }));
}
