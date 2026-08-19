"use client";

export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;
  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

export async function apiJson<T>(input: RequestInfo | URL, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  headers.set("Accept", "application/json");
  const response = await fetch(input, { ...init, headers, cache: init.cache ?? "no-store" });
  const body = await response.json().catch(() => null) as T & { error?: string } | null;
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body && typeof body.error === "string"
      ? body.error
      : `Falha na operação (${response.status}).`;
    throw new ApiError(message, response.status, body);
  }
  return body as T;
}

export function requestOperationalRefresh() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("lfb:refresh-operation"));
}

export function formatApiError(error: unknown, fallback = "Não foi possível concluir a operação.") {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
