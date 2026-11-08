/** Limite técnico de numeração; as mesas reais são as cadastradas e ativas no banco. */
export const MAX_TABLE_NUMBER = 999;
export const isTableNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_TABLE_NUMBER;
