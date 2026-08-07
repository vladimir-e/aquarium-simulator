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
 * except exactly none, where they read 0 like everything else.
 */
export function monodFactor(concentration: number, halfSaturation: number): number {
  if (concentration <= 0) return 0;
  return concentration / (halfSaturation + concentration);
}

/**
 * Irradiance scaling for photosynthesis — `tanh(I / Ik)`, the Jassby–Platt
 * photosynthesis–irradiance curve.
 *
 * `Ik` is the saturating irradiance, where the leaf already runs at 76 % of its
 * maximum. Below it the response is close to linear — twice the light, nearly
 * twice the rate; above it the curve flattens hard, so a brighter fixture stops
 * buying anything.
 *
 * Not Monod, though the shapes rhyme. Monod is there to stop a *stock* being
 * overdrawn: demand falls with supply, so the pool approaches zero instead of
 * crossing it. Light is not a stock — nothing depletes photons, and no rate can
 * overdraw an intensity — so the curve is taken from the leaf rather than from
 * the pool, and the leaf's own is the one the literature fits. Its shoulder is
 * sharper than the rectangular hyperbola's, whose tail goes on paying for more
 * light forever.
 */
export function lightSaturationFactor(par: number, saturationIrradiance: number): number {
  if (par <= 0) return 0;
  if (saturationIrradiance <= 0) return 1;
  return Math.tanh(par / saturationIrradiance);
}
