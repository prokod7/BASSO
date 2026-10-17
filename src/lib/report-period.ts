export function saoPauloDate(value: string | Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}
function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function reportPeriod(startValue: string | null, endValue: string | null, now = new Date()) {
  const today = saoPauloDate(now);
  const start = startValue || `${today.slice(0, 7)}-01`, end = endValue || today;
  if (!validDate(start) || !validDate(end) || start > end) throw new Error('Informe um período válido: a data inicial deve ser anterior ou igual à final.');
  return { start, end, startIso: new Date(`${start}T00:00:00.000-03:00`).toISOString(), endIso: new Date(`${end}T23:59:59.999-03:00`).toISOString() };
}
