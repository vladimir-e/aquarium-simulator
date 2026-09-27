/**
 * Default ceiling on a bank (half the condition scale). The fish and plant
 * configs both start from it and tune apart; a bloom banks to the plants'.
 */
export const SURPLUS_CAP_DEFAULT = 50;

/** The whole condition scale: no bank holds more condition than an organism has. */
export const MAX_SURPLUS_CAP = 100;
