/**
 * Default ceiling on a bank (half the condition scale). The fish and plant
 * configs both start from it and tune apart; a bloom banks to the plants'.
 */
export const SURPLUS_CAP_DEFAULT = 50;

/** Whether a bank is full, the moment it buys an offspring. Never at a cap of 0, where every bank reads full. */
export function bankFull(surplus: number, cap: number): boolean {
  return cap > 0 && surplus >= cap;
}

/** The whole condition scale: no bank holds more condition than an organism has. */
export const MAX_SURPLUS_CAP = 100;
