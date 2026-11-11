import { describe, expect, it } from "vitest";
import { operationalDayStart } from "@/lib/operational-day";

describe("virada do dia às 3h", () => {
  it("antes das 3h ainda é o dia anterior; depois das 3h começa o novo", () => {
    expect(operationalDayStart(new Date("2026-11-12T05:30:00Z")).toISOString()).toBe("2026-11-11T06:00:00.000Z"); // 02:30 em Brasília
    expect(operationalDayStart(new Date("2026-11-12T06:00:00Z")).toISOString()).toBe("2026-11-12T06:00:00.000Z"); // 03:00
    expect(operationalDayStart(new Date("2026-11-12T01:00:00Z")).toISOString()).toBe("2026-11-11T06:00:00.000Z"); // 22:00 do dia 11
  });
});
