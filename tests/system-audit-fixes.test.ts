import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { inflateSync } from "zlib";
import { formatElapsedMinutes, isDemoMode } from "@/lib/utils";
import { isAuthorizedPrintBridge } from "@/lib/print-bridge-auth";

afterEach(() => vi.unstubAllEnvs());

describe("formatElapsedMinutes", () => {
  it("mantém minutos abaixo de 1 hora", () => {
    expect(formatElapsedMinutes(0)).toBe("0 min");
    expect(formatElapsedMinutes(59)).toBe("59 min");
  });
  it("converte para horas e dias", () => {
    expect(formatElapsedMinutes(65)).toBe("1h 05min");
    expect(formatElapsedMinutes(1440)).toBe("1d");
    expect(formatElapsedMinutes(7378)).toBe("5d 2h");
  });
  it("trata valores inválidos", () => {
    expect(formatElapsedMinutes(Number.NaN)).toBe("0 min");
    expect(formatElapsedMinutes(-5)).toBe("0 min");
  });
});

describe("modo demonstração fail-closed", () => {
  it("só ativa com NEXT_PUBLIC_DEMO_MODE=true", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "");
    expect(isDemoMode()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
    expect(isDemoMode()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    expect(isDemoMode()).toBe(true);
  });
});

describe("chave do Print Bridge", () => {
  it("rejeita quando a chave não está configurada", () => {
    vi.stubEnv("PRINT_BRIDGE_KEY", "");
    expect(isAuthorizedPrintBridge("qualquer")).toBe(false);
    expect(isAuthorizedPrintBridge(null)).toBe(false);
  });
  it("aceita apenas a chave exata", () => {
    vi.stubEnv("PRINT_BRIDGE_KEY", "segredo-da-ponte");
    expect(isAuthorizedPrintBridge("segredo-da-ponte")).toBe(true);
    expect(isAuthorizedPrintBridge("segredo-da-ponte ")).toBe(false);
  });
});

describe("ativos da marca", () => {
  it("logo e ícones são PNG íntegros (dados comprimidos decodificáveis)", () => {
    for (const file of ["public/assets/brand/logo.png", "public/assets/brand/splash.png", "public/icons/icon-192.png", "public/icons/icon-512.png"]) {
      const data = readFileSync(file);
      expect(data.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(data.subarray(-8, -4).toString("ascii")).toBe("IEND");
      const idat: Buffer[] = [];
      for (let offset = 8; offset < data.length;) {
        const length = data.readUInt32BE(offset);
        if (data.subarray(offset + 4, offset + 8).toString("ascii") === "IDAT") idat.push(data.subarray(offset + 8, offset + 8 + length));
        offset += 12 + length;
      }
      expect(() => inflateSync(Buffer.concat(idat))).not.toThrow();
    }
  });
});
