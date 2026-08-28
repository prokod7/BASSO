import { z } from "zod";
import type { FiscalPaymentMethod, FiscalSource } from "./mappings";

export const FISCAL_TIME_ZONE = "America/Sao_Paulo";

export const fiscalReadableStatuses = [
  "received",
  "confirmed",
  "preparing",
  "ready",
  "out_for_delivery",
  "completed",
] as const;

export type FiscalReadableStatus = typeof fiscalReadableStatuses[number];
export type FiscalStatusFilter = FiscalReadableStatus | "all";

const querySchema = z.object({
  start: z.string().optional(),
  end: z.string().optional(),
  payment: z.enum(["pix", "cash", "debit", "credit", "other"]).optional(),
  source: z.enum(["cardapio", "pdv", "mesa", "ifood", "99food", "other"]).optional(),
  q: z.string().trim().min(1).max(100).optional(),
  status: z.enum([...fiscalReadableStatuses, "all"]).default("completed"),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  cursor: z.string().max(256).optional(),
}).strict();

const cursorSchema = z.object({
  v: z.literal(1),
  lastNumber: z.string().regex(/^\d+$/),
});

export class FiscalQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FiscalQueryError";
  }
}

type DateParts = { year: number; month: number; day: number };

function parseDateParts(value: string): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) return null;
  return { year, month, day };
}

function timezoneOffsetMs(instantMs: number, timeZone = FISCAL_TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(instantMs)).map(part => [part.type, part.value]),
  );
  const representedAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return representedAsUtc - Math.floor(instantMs / 1000) * 1000;
}

export function localDateStartUtc(value: string, timeZone = FISCAL_TIME_ZONE): string {
  const parts = parseDateParts(value);
  if (!parts) throw new FiscalQueryError("Período inválido.");

  const targetWallClock = Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0);
  let instant = targetWallClock;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const candidate = targetWallClock - timezoneOffsetMs(instant, timeZone);
    if (candidate === instant) break;
    instant = candidate;
  }
  return new Date(instant).toISOString();
}

export function nextLocalDate(value: string): string {
  const parts = parseDateParts(value);
  if (!parts) throw new FiscalQueryError("Período inválido.");
  const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
  return [
    String(next.getUTCFullYear()).padStart(4, "0"),
    String(next.getUTCMonth() + 1).padStart(2, "0"),
    String(next.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function encodeFiscalCursor(lastNumber: string | number): string {
  return Buffer.from(JSON.stringify({ v: 1, lastNumber: String(lastNumber) }), "utf8").toString("base64url");
}

export function decodeFiscalCursor(cursor: string) {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    return cursorSchema.parse(parsed);
  } catch {
    throw new FiscalQueryError("Cursor inválido.");
  }
}

export type FiscalQuery = {
  start?: string;
  end?: string;
  startUtc?: string;
  endExclusiveUtc?: string;
  payment?: FiscalPaymentMethod;
  source?: FiscalSource;
  q?: string;
  qTarget?: { kind: "number" | "id"; value: string };
  status: FiscalStatusFilter;
  limit: number;
  cursor?: { v: 1; lastNumber: string };
};

export function parseFiscalQuery(searchParams: URLSearchParams): FiscalQuery {
  const raw = Object.fromEntries(searchParams.entries());
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) throw new FiscalQueryError("Parâmetros inválidos.");

  const input = parsed.data;
  if (input.start && !parseDateParts(input.start)) throw new FiscalQueryError("Período inválido.");
  if (input.end && !parseDateParts(input.end)) throw new FiscalQueryError("Período inválido.");
  if (input.start && input.end && input.start > input.end) throw new FiscalQueryError("Período inválido.");

  const qTarget = input.q
    ? /^\d+$/.test(input.q)
      ? { kind: "number" as const, value: input.q }
      : { kind: "id" as const, value: input.q }
    : undefined;

  return {
    start: input.start,
    end: input.end,
    startUtc: input.start ? localDateStartUtc(input.start) : undefined,
    endExclusiveUtc: input.end ? localDateStartUtc(nextLocalDate(input.end)) : undefined,
    payment: input.payment,
    source: input.source,
    q: input.q,
    qTarget,
    status: input.status,
    limit: input.limit,
    cursor: input.cursor ? decodeFiscalCursor(input.cursor) : undefined,
  };
}
