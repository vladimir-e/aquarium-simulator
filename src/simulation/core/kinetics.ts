/**
 * Temperature scaling for biological rates.
 *
 * Q10 is the factor a rate multiplies by per 10 °C: 2 doubles every ten
 * degrees, 3 triples. Every process in the engine that runs on enzymes —
 * food decay, plant respiration, nitrification — scales this way, and each
 * quotes its own coefficient and its own reference temperature against this
 * one function.
 */
export function q10Factor(temperature: number, q10: number, referenceTemp: number): number {
  return Math.pow(q10, (temperature - referenceTemp) / 10.0);
}
