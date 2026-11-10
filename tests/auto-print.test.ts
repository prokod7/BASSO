import { describe, expect, it } from "vitest";
import { shortcutScript, stationPath } from "@/components/internal/AutoPrintSetup";

describe("atalho de impressão automática", () => {
  it("abre a estação com impressão silenciosa em perfil separado do Chrome", () => {
    const path = stationPath(["kitchen", "counter"], 2);
    expect(path).toBe("/painel/impressao/automatica?setores=kitchen,counter&vias=2&ligar=1");
    const bat = shortcutScript(`https://basso-seven.vercel.app${path}`);
    expect(bat).toContain("--kiosk-printing");
    expect(bat).toContain('--user-data-dir="%LOCALAPPDATA%\\BassoImpressao"');
    expect(bat).toContain('--app="https://basso-seven.vercel.app/painel/impressao/automatica?setores=kitchen,counter&vias=2&ligar=1"');
    expect(bat.split("\r\n").length).toBeGreaterThan(5);
  });
});
