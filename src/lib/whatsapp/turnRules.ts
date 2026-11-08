import type { Pending } from "./domain";

type TurnLike = {
  action: string;
  response: string;
  pending: Pending | null;
};

/**
 * Pending summary after an AI turn. A plain answer keeps it confirmable, unless the
 * answer asks something ("Quer adicionar um guaraná?"): then a "sim" must not confirm
 * the old summary, so it is dropped and the AI re-quotes.
 */
export function pendingAfter(turn: TurnLike, current: Pending | null) {
  if (turn.pending) return turn.pending;
  if (turn.action !== "reply" || !current) return null;
  return current.awaiting_receipt || !turn.response.includes("?")
    ? current
    : null;
}
