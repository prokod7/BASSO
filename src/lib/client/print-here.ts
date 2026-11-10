"use client";

import { requestPrint } from "@/components/print/PrintHost";
import type { PrintType } from "@/components/print/OrderTicket";

export type { PrintType };

/** Impressão manual: imprime na hora neste aparelho (sem fila, sem janela extra). */
export function printHere(orderId: string, types: PrintType[], source: "order_detail" | "kds" | "print_page" = "order_detail") {
  return requestPrint({ orderId, types, source });
}
