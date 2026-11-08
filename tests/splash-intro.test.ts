// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({ default: (props: Record<string, unknown>) => React.createElement("img", { alt: props.alt as string, src: props.src as string }) }));
import { SPLASH_STORAGE_KEY, SplashIntro } from "@/components/public/SplashIntro";

beforeEach(() => { Object.assign(globalThis, { React }); sessionStorage.clear(); vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("abertura animada", () => {
  it("aparece na primeira visita e some sozinha", () => {
    render(React.createElement(SplashIntro));
    expect(screen.getByRole("status", { name: /Carregando La Forneria Basso/ })).toBeTruthy();
    expect(screen.getByText("Pizzaria artesanal")).toBeTruthy();
    expect(sessionStorage.getItem(SPLASH_STORAGE_KEY)).toBe("1");
    act(() => { vi.advanceTimersByTime(4000); });
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("não reaparece na mesma sessão", () => {
    sessionStorage.setItem(SPLASH_STORAGE_KEY, "1");
    render(React.createElement(SplashIntro));
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("toque pula a abertura", () => {
    render(React.createElement(SplashIntro));
    fireEvent.click(screen.getByRole("status"));
    act(() => { vi.advanceTimersByTime(700); });
    expect(screen.queryByRole("status")).toBeNull();
  });
});
