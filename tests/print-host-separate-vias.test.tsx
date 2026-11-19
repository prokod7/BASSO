// @vitest-environment jsdom
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PrintHost, requestPrint } from "@/components/print/PrintHost";

vi.mock("@/components/public/useStoreAvailability", () => ({ useStoreAvailability: () => ({}) }));
vi.mock("@/components/print/OrderTicket", () => ({
  OrderTicket: ({ printType }: { printType: string }) => React.createElement("div", null, printType),
  TestTicket: () => React.createElement("div", null, "teste"),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("envia cada via e cada cópia em um trabalho de impressão separado", async () => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ order: { id: "pedido", channel: "pickup" } })));
  const printed: string[][] = [];
  const print = vi.spyOn(window, "print").mockImplementation(() => {
    printed.push(Array.from(document.querySelectorAll(".print-receipt .print-via"), node => node.textContent || ""));
    window.dispatchEvent(new Event("afterprint"));
  });
  render(<PrintHost />);
  await requestPrint({ orderId: "pedido", types: ["cozinha", "entrega"], copies: 2 });
  expect(print).toHaveBeenCalledTimes(4);
  expect(printed).toEqual([["cozinha"], ["entrega"], ["cozinha"], ["entrega"]]);
});
