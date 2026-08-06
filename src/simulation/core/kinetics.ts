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

/**
 * Substrate scaling for biological rates — `[S] / (K + [S])`, the Monod curve.
 *
 * Full rate while the substrate is plentiful, half rate at `K`, and nothing at
 * all once it is gone. Every process quotes its own half-saturation constant,
 * the way each quotes its own Q10.
 *
 * A stock drawn through this factor is never overdrawn: demand falls with
 * supply, so the stock approaches zero rather than crossing it, and no clamp,
 * ration or ordering rule is needed to keep it there.
 *
 * The empty-substrate guard comes first, which matters to the counterfactual
 * runs that take the term out with `K = 0`: those read 1 at every concentration
 * except exactly none, where they read 0 like everything else. A control that
 * reaches exactly zero therefore stops drawing, and flatters itself against the
 * bounded run it exists to be compared with.
 */
export function monodFactor(concentration: number, halfSaturation: number): number {
  if (concentration <= 0) return 0;
  return concentration / (halfSaturation + concentration);
}
