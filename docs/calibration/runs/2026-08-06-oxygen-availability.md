# The oxygen a tank cannot spend: `gas-volume-stoichiometry`

Date: 2026-08-06 · Branch: `gas-volume-stoichiometry` · Roadmap §2, subtask 2b

Every oxygen consumer in the tick drew without bound. `resources.oxygen` is
floored at 0 by the resource layer, silently, so an exhausted tank went on
emitting CO₂ for oxygen that was never there — the mirror of the carbon-from-
nothing defect 2b exists to remove.

The answer is a rate, not a gate: every aerobic process multiplies by
`[O2] / (K + [O2])`, Monod saturation, added to `core/kinetics.ts` beside
`q10Factor`. Demand falls with supply, so the stock approaches zero instead of
crossing it. No clamp, no ration, no change to the effect system or the tier
ordering.

Probe: `npm run probe:oxygen-limited-draw`.

---

## The constants

| process | K (mg/L) | rate left at 8 mg/L | pinned against |
|---|---|---|---|
| aerobic decomposition | **0.20** | 97.6 % | ASM1 `K_O,H` = 0.2 for heterotrophs |
| plant respiration | **0.50** | 94.1 % | macrophyte tissue turns O₂-limited at 1–2 mg/L |
| fish respiration | **1.00** | 88.9 % | P_crit for warm-water teleosts, 1–2 mg/L |

Each is the concentration at which the process runs at half its base rate, which
makes every base rate in those three systems a rate *at saturating oxygen* —
which is what a measured biological rate is.

Fish carry the highest K deliberately: a fish feels a shortage before the
bacteria do, and it is the consumer whose collapse the player is meant to see.
Damage is unchanged and separate — `oxygenStressThreshold` still charges a fish
for the water it is in, so a suffocating fish draws less oxygen *and* suffers
more.

## What each consumer asks for

A 20 L, stagnant, 30 °C, 8 neon tetras and 240 total plant size, held at each
oxygen with 5 g of food standing. mg/L/h, beside the share of the unbounded draw.

| O₂ mg/L | decay | of full | fish | of full | plants | of full | CO₂ out |
|---|---|---|---|---|---|---|---|
| 8.00 | 2.6016 | 0.976 | 0.0536 | 0.889 | 0.5322 | 0.941 | 3.6370 |
| 4.00 | 2.5397 | 0.952 | 0.0483 | 0.800 | 0.5027 | 0.889 | 3.5459 |
| 2.00 | 2.4242 | 0.909 | 0.0402 | 0.667 | 0.4524 | 0.800 | 3.3783 |
| 1.00 | 2.2222 | 0.833 | 0.0302 | 0.500 | 0.3770 | 0.667 | 3.0894 |
| 0.50 | 1.9047 | 0.714 | 0.0201 | 0.333 | 0.2827 | 0.500 | 2.6418 |
| 0.25 | 1.4815 | 0.556 | 0.0121 | 0.200 | 0.1885 | 0.333 | 2.0508 |
| 0.10 | 0.8889 | 0.333 | 0.0055 | 0.091 | 0.0942 | 0.167 | 1.2285 |
| 0.00 | 0.0000 | — | 0.0000 | — | 0.0000 | — | **0.0000** |

All three throttle, each on its own curve, and the `CO₂ out` column is the point
of the exercise: carbon is derived from the oxygen actually consumed, so it
falls with it and reaches zero where the oxygen does. It costs nothing to keep
true — the derivation was already in place from the first half of 2b.

## What it is worth at the tank

Six days, fed 1 g/day. `unpaid O₂` is oxygen the tick asked for beyond what the
water was holding, summed over the run; `phantom CO₂` is the carbon that oxygen
would have paid for.

| tank | draw | overdrawn h | unpaid O₂ | phantom CO₂ |
|---|---|---|---|---|
| stagnant 20 L, 240 plant size | unbounded | 24 | 12.80 | 17.60 |
| stagnant 20 L, 240 plant size | **saturating** | 15 | **0.59** | **0.81** |
| stagnant 20 L, 600 plant size | unbounded | 35 | 45.01 | 61.90 |
| stagnant 20 L, 600 plant size | **saturating** | 45 | **12.80** | **17.60** |
| sponge + air, 600 plant size | unbounded | 0 | 0.00 | 0.00 |
| sponge + air, 600 plant size | **saturating** | 0 | **0.00** | **0.00** |

A stressed tank manufactures 4 % of the carbon it used to. A tank with the
circulation a keeper would actually give it never reaches the condition at all,
before or after — which is the right shape: the defect only ever fired in tanks
already in failure.

**It does not go to zero, and the reason is the tick.** The factor scales
demand, but a tick is an hour: a consumer whose reduced demand still outruns the
standing stock overshoots inside the step. In the 600-size jungle the planting
alone wants 1.35 mg/L/h against a tank holding 0.19, so 12.8 mg/L still goes
unpaid across six days. What is left of the overdraw goes with tick resolution
rather than with the factor, and closing it properly would mean integrating the
draw across the step — which couples the three consumers into the tick-wide
rationing pass this design exists to avoid. Recorded rather than fixed.

---

## Nitrification: measured, not shipped

Nitrification is strictly aerobic and reads no oxygen at all. It was built —
Monod on both guilds with separate half-saturation constants, plus the textbook
3.43 / 1.14 mg O₂ per mg N derived through `core/chemistry.ts` — and then held
back. The work is on the local branch `nitrification-oxygen-limited`.

**The draw is free.** With the two half-saturation constants neutralised and the
oxygen consumption left in, the cycling figures reproduce the baseline exactly:

| | nitrite peak | peak day | cycled day | 24 h dose clearance |
|---|---|---|---|---|
| baseline | 4.945 | 14.83 | 21.167 | 0.1684 |
| draw only, no factor | 4.945 | 14.83 | 21.167 | 0.1684 |
| draw + factor (0.3 / 1.1) | 5.179 | 16.25 | 23.375 | 0.2622 |

A fishless 150 L never falls below 7.94 mg/L while cycling, so the nitrifiers'
own oxygen demand is inside what the surface delivers.

**The rate limitation is what moves the tank, and no published K holds the tight
bands.** Sweeping both constants at 150 L:

| ceiling | admits | published floor |
|---|---|---|
| nitrite peak ≤ 5 ppm | K_NOB ≤ 0.28 | 0.6 (Wiesmann: 1.1) |
| 24 h dose clearance < 0.25 | K_AOB ≤ 0.26 | 0.3 |

Both sit just under the bottom of the literature, because the nitrifier rate
constants were fitted with no oxygen term at all and have no headroom for one.

Re-deriving `inoculumPerLiter` recovers three of the four — at 0.85–1.1 the peak
falls back under 5 ppm, its day back inside 12–16, and the cycled day lands
21.2–22.3. Nothing in reach recovers dose clearance: it is measured on a settled
colony, where only the AOB rate matters, and it reads 0.27–0.29 across the whole
inoculum range. Closing it needs `bacteriaProcessingRate` to move as well — two
calibration constants in a feature branch, which is the calibration pass, not
this one.

**The permissive anchor never broke.** The cycle completes on day 23.4 at every
volume, inside 15–35 throughout, and inside the tighter 21–28 as well.

Two further findings from the same build, worth keeping:

- Applying the factor to colony *growth* as well as to throughput is free. It
  cancels against the utilization term wherever the colony is substrate-limited
  — identical figures to four decimal places — and only bites at full
  utilization, which is exactly where it should: it stops a colony ballooning in
  an anoxic tank while maintenance decay keeps thinning it.
- A biofilm at 90 % of its surface ceiling stops being reachable. Any ammonia
  load large enough to fill the surface strips the oxygen first, and NOB stall:
  a bare 200 L tops out at 86 % / 69 %, and 96 % / 84 % with an air pump and a
  powerhead. The `bacteriaSummary` "both colonies have filled the surface"
  branch would become unreachable copy.

---

## Anchors

The four permissive anchors hold on the shipped branch: the cycle completes in
15–35 days at every volume, mass conservation holds end-to-end, a sane preset
survives 90 days, nothing runs away. `npm test` 2592 passed / 148 files,
`npm run typecheck` clean on all three configs, `npm run lint` clean apart from
the 3 standing `no-console` warnings.
