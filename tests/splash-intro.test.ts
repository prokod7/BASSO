// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({ default: (props: Record<string, unknown>) => React.createElement("img", { alt: props.alt as string, src: props.src as string }) }));
import { SplashIntro } from "@/components/public/SplashIntro";

beforeEach(() => { Object.assign(globalThis, { React }); vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("abertura animada", () => {
  it("aparece na primeira visita e some sozinha", () => {
    render(React.createElement(SplashIntro));
    expect(screen.getByRole("status", { name: /Carregando La Forneria Basso/ })).toBeTruthy();
    expect(screen.getByText("Pizzaria artesanal")).toBeTruthy();
    act(() => { vi.advanceTimersByTime(1900); });
    expect(screen.getByRole("status")).toBeTruthy();
    act(() => { vi.advanceTimersByTime(800); });
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("aparece de novo em toda visita", () => {
    const first = render(React.createElement(SplashIntro));
    act(() => { vi.advanceTimersByTime(3000); });
    first.unmount();
    render(React.createElement(SplashIntro));
    expect(screen.getByRole("status")).toBeTruthy();
  });
  it("toque pula a abertura", () => {
    render(React.createElement(SplashIntro));
    fireEvent.click(screen.getByRole("status"));
    act(() => { vi.advanceTimersByTime(700); });
    expect(screen.queryByRole("status")).toBeNull();
  });
});
