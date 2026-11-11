/**
 * Dia de operação da Basso: vira às 3h da madrugada (horário de Brasília). A área de Pedidos
 * mostra só o que entrou desde a última virada (pedidos ainda em andamento continuam visíveis).
 */
export const DAY_ROLLOVER_HOUR = 3;

export function operationalDayStart(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now).map((p) => [p.type, p.value]));
  // Brasília é UTC-3 o ano todo (sem horário de verão).
  const todayRollover = new Date(`${parts.year}-${parts.month}-${parts.day}T${String(DAY_ROLLOVER_HOUR).padStart(2, "0")}:00:00-03:00`);
  return Number(parts.hour) >= DAY_ROLLOVER_HOUR ? todayRollover : new Date(todayRollover.getTime() - 24 * 3600_000);
}
