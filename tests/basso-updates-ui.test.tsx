// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CartProvider } from "@/context/CartContext";
import { PizzaBuilder } from "@/components/public/PizzaBuilder";
import { findFlavor } from "@/lib/catalog";
import { WhatsAppHandoffAlert } from "@/components/internal/WhatsAppHandoffAlert";
import DriverAuthorizationPage from "@/app/autorizacao-motoboy/page";
const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/image", () => ({ default: ({ fill, priority, ...props }: any) => <img {...props} /> }));
beforeEach(() => { Object.assign(globalThis, { React }); localStorage.clear(); vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const mount = (id: string) => render(<CartProvider><PizzaBuilder flavor={findFlavor(id)} open onClose={() => {}} initialSelection={{ size: "broto", mass: "traditional", flavorA: id, removedA: [], removedB: [], addons: {}, notes: "" }} /></CartProvider>);
describe("fluxos visíveis da Basso", () => {
  it("oferece meio a meio da broto doce e permite escolher salgado", () => {
    mount("brigadeiro");
    fireEvent.click(screen.getByRole("button", { name: /Meio a meio 50%/ }));
    expect(screen.getByRole("button", { name: /^Mozzarella / })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Chocolate / }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /^Mozzarella / }));
    expect(screen.getByText("Metade 2")).toBeTruthy();
  });
  it("ao iniciar com salgado, oferece somente doces como segunda metade da broto", () => {
    mount("mozzarella");
    fireEvent.click(screen.getByRole("button", { name: /Meio a meio 50%/ }));
    expect(screen.queryByRole("button", { name: /^Calabresa / })).toBeNull();
    expect(screen.getAllByRole("button", { name: /^Chocolate / }).length).toBeGreaterThan(0);
  });
  it("mantém chamado visível, toca som e remove o aviso quando a conversa é atendida", async () => {
    vi.useFakeTimers();
    let alerts = [{ id: "job", sessionId: "session", name: "Cliente teste", at: "2026-11-15T12:00:00Z" }];
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ alerts }) })));
    const play = vi.fn(async () => {});
    vi.stubGlobal("Audio", class { currentTime = 0; play = play; pause() {} });
    render(<WhatsAppHandoffAlert enabled />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole("alert")).toBeTruthy(); expect(play).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: "Atender Cliente teste" }).getAttribute("href")).toContain("?session=session");
    alerts = [];
    await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("exige confirmação expressa e envia a versão lida com o nome ao registrar aceite", async () => {
    const fetcher = vi.fn(async (_url: string, options?: RequestInit) => ({ ok: true, json: async () => options?.method === "POST" ? { accepted: true } : { name: "Motoboy local", document: { version: "v-test", title: "Autorização", body: "Termos de teste" } } }));
    vi.stubGlobal("fetch", fetcher);
    render(<DriverAuthorizationPage />);
    await screen.findByText("Termos de teste");
    const button = screen.getByRole("button", { name: "Aceitar e acessar minhas entregas" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(button);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/painel/motoboy"));
    expect(JSON.parse(fetcher.mock.calls[1][1]!.body as string)).toEqual({ version: "v-test", name: "Motoboy local", accepted: true });
  });
});
