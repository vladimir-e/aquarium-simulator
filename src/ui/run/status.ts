/**
 * The health vocabulary shared across the instrument surface — sparklines,
 * condition bars, status words and alert outlines all speak it — and the
 * reading that resolves an organism's two stocks into one line of it.
 */

import { spendableSurplus, type VitalityBreakdown } from '../../simulation/index.js';

/** The four-way status every coloured element on the surface is tinted by. */
export type Status = 'ok' | 'warn' | 'alert' | 'neutral';

/** Condition on the 0–100 vitality axis every organism in the tank is scored on. */
export function conditionStatus(condition: number): Status {
  return condition < 30 ? 'alert' : condition < 60 ? 'warn' : 'ok';
}

export function conditionWord(condition: number): string {
  if (condition < 10) return 'dying';
  if (condition < 30) return 'struggling';
  if (condition < 60) return 'fair';
  if (condition < 80) return 'good';
  return 'thriving';
}

/** Ranking for the vocabulary, so "worst first" is one definition. */
export const STATUS_SEVERITY: Record<Status, number> = { neutral: 0, ok: 0, warn: 1, alert: 2 };

/** One row's headline: how it is doing, and the word for it. */
export interface Reading {
  status: Status;
  word: string;
}

/**
 * What the energy ledger has to say that the condition axis cannot.
 *
 * An organism that stores its energy pays an unaffordable upkeep bill out of
 * tissue, so condition stays where it is while the organism shrinks — the whole
 * point of the two ledgers, and the reason condition alone reported a
 * blacked-out plant as thriving all the way down to nothing.
 *
 * Two rungs, and they are not the same state. `starved` is the share of the
 * bill neither income nor the bank could cover: tissue is going *now*. Above it
 * sits a bank with nothing left over `reserved`, still paying out — damage no
 * longer buffers, repair and growth have both stopped, and every unit left is
 * spoken for by staying alive. That is the early warning, and it is a reading
 * of the bank as a stock rather than of the tick's flow: `drained > 0` on its
 * own fires every dark hour of a thriving tank, because a plant with no light
 * has no income and pays the night out of the bank by design.
 */
function energyReading(surplus: number, breakdown: VitalityBreakdown): Reading | null {
  if (breakdown.starved > 0) return { status: 'alert', word: 'starving' };
  if (breakdown.drained > 0 && spendableSurplus(surplus, breakdown.reserved) === 0) {
    return { status: 'warn', word: 'burning' };
  }
  return null;
}

/**
 * How an organism is doing, read across both stocks it keeps — the worse of the
 * two channels, with condition taking a tie because it is the stock the bar
 * beside the word already shows. So a plant losing tissue in the dark escalates
 * `thriving → burning → starving → struggling → dying` instead of holding
 * `thriving` while it sheds.
 */
export function vitalReading(
  condition: number,
  surplus: number,
  breakdown: VitalityBreakdown
): Reading {
  const health: Reading = {
    status: conditionStatus(condition),
    word: conditionWord(condition),
  };
  const energy = energyReading(surplus, breakdown);

  return energy !== null && STATUS_SEVERITY[energy.status] > STATUS_SEVERITY[health.status]
    ? energy
    : health;
}
