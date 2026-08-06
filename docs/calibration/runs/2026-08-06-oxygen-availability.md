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

A fourth consumer joined them later on the same branch: both nitrifier guilds,
K = 0.30 AOB and 1.10 NOB, derived and measured in
`2026-08-07-nitrification-on-air.md`. Every figure below is the four-consumer
budget.

## What each consumer asks for

A 20 L, stagnant, 30 °C, 8 neon tetras and 240 total plant size, held at each
oxygen with 5 g of food and 2 ppm of ammonia standing. mg/L/h, with the share of
the unbounded draw in brackets.

| O₂ mg/L | decay | nitrifiers | fish | plants | CO₂ out |
|---|---|---|---|---|---|
| 8.00 | 2.6016 (0.976) | 0.3352 (0.963) | 0.0536 (0.889) | 0.5322 (0.941) | 3.6370 |
| 6.00 | 2.5806 (0.968) | 0.3296 (0.947) | 0.0517 (0.857) | 0.5219 (0.923) | 3.6061 |
| 4.00 | 2.5397 (0.952) | 0.3191 (0.917) | 0.0483 (0.800) | 0.5026 (0.889) | 3.5459 |
| 2.00 | 2.4242 (0.909) | 0.2923 (0.840) | 0.0402 (0.667) | 0.4523 (0.800) | 3.3783 |
| 1.00 | 2.2222 (0.833) | 0.2521 (0.724) | 0.0302 (0.500) | 0.3770 (0.667) | 3.0894 |
| 0.50 | 1.9047 (0.714) | 0.1997 (0.574) | 0.0201 (0.333) | 0.2827 (0.500) | 2.6418 |
| 0.25 | 1.4815 (0.556) | 0.1424 (0.409) | 0.0121 (0.200) | 0.1885 (0.333) | 2.0508 |
| 0.10 | 0.8889 (0.333) | 0.0770 (0.221) | 0.0055 (0.091) | 0.0942 (0.167) | 1.2285 |
| 0.00 | 0.0000 | 0.0000 | 0.0000 | 0.0000 | **0.0000** |

All four throttle, each on its own curve, and the `CO₂ out` column is the point
of the exercise: carbon is derived from the oxygen actually consumed, so it
falls with it and reaches zero where the oxygen does. It costs nothing to keep
true — the derivation was already in place from the first half of 2b.

**The ammonia is pinned for the same reason the food is.** A consumer short of
substrate reads its substrate and not its factor — `min(capacity, what is
there)` takes the second argument — and on the standing ammonia this tank
actually carries, the nitrifier column is flat at 1.000 the whole way down. What
that column shows is the factor; what a tank's biofilter usually shows is the
load.

> **Superseded.** The table above used to carry three consumers and no ammonia
> pin, because `draws()` in the probe summed decay, plants and fish while the
> tank paid for nitrification too. Its decay, fish and plant figures still
> reproduce to within a digit in the last place; what it was missing was a
> column.

## What it is worth at the tank

Six days, fed 1 g/day. `asked O₂` is what the four consumers wanted across the
run; `unpaid O₂` is the part of it the water was not holding when they asked;
`phantom CO₂` is the carbon that unpaid oxygen would have bought.

| tank | draw | overdrawn h | asked O₂ | unpaid O₂ | phantom CO₂ |
|---|---|---|---|---|---|
| stagnant 20 L, 240 plant size | unbounded | 124 | 247.26 | 189.97 | 261.27 |
| stagnant 20 L, 240 plant size | **saturating** | 122 | 109.26 | **56.50** | **77.70** |
| stagnant 20 L, 600 plant size | unbounded | 95 | 352.95 | 177.86 | 244.61 |
| stagnant 20 L, 600 plant size | **saturating** | 126 | 177.40 | **102.14** | **140.47** |
| sponge + air, 600 plant size | unbounded | 16 | 296.37 | 6.71 | 9.23 |
| sponge + air, 600 plant size | **saturating** | 5 | 277.02 | **2.82** | **3.88** |

The factor takes 56 % off what the stressed 20 L asks for and 70 % off what it
cannot pay. **The residual is not small.** That tank still draws 56.50 mg/L of
oxygen it never had across six days — a little over half of everything it asked
for — and still manufactures 78 mg/L of CO₂ against 261 before, which is 30 % of
the phantom carbon rather than a rounding error. The 600-size jungle keeps 58 %
of its overdraw.

The bigger planting overdraws *less* in total than the smaller one under the
unbounded draw, and it is not a paradox: four times the leaf area is also four
times the daytime photosynthesis, so the tank spends fewer hours short (95
against 124) and pays more heavily in each of them.

Circulation is still what decides whether a tank is in this regime at all, but
it is no longer a clean zero: a sponge and an air pump cover the 240-size
planting outright — `oxygen-limited-draw.test.ts` asserts that tank owes exactly
nothing, on a 3.05 mg/L margin at its tightest hour — and leave the 600-size
jungle 2.82 mg/L short across five of its 144 hours.

**It does not go to zero, and the reason is the tick.** The factor scales
demand, but a tick is an hour: a consumer whose reduced demand still outruns the
standing stock overshoots inside the step. Closing it properly would mean
integrating the draw across the step — which couples the four consumers into the
tick-wide rationing pass this design exists to avoid. Recorded rather than
fixed.

**Nitrification is the reason the residual is this size, and it is a load and
not a rate.** Summed over the stagnant 240-size run the four consumers ask for
38.21 decay + 35.62 nitrifiers + 34.34 plants + 1.09 fish mg/L; unbounded, the
same run reads 61.20 / 100.42 / 84.05 / 1.59. The guilds are the largest single
consumer in a fed tank, because their demand is set by the nitrogen arriving
rather than by a rate the factor can trim — 1 g of food a day into 20 L is a
standing oxygen bill, and the availability factor can only make the tank slower
to pay it.

> **Superseded.** This section used to read 24 h / 12.80 unpaid against 15 h /
> **0.59** for the stagnant 240-size tank, a zero on both aerated rows, and "a
> stressed tank manufactures 4 % of the carbon it used to". Those were the
> three-consumer probe, measured before nitrification drew any oxygen at all;
> neither the fixture nor the constants moved, the missing consumer did.

---

## Nitrification: measured, not shipped

> **Superseded.** It ships. The wall below was real and the way through it was
> that the nitrifier rate constants had to be re-quoted as Monod maxima, which
> this pass had not tried — see `2026-08-07-nitrification-on-air.md`. Everything
> under this heading is the measurement as it stood on the day.

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

  > **Superseded.** The conclusion does not hold on the shipped rates. A
  > canister, an air pump and a 400 GPH powerhead put a saturating-dosed 200 L
  > at 95.9 % / 90.1 % — over the threshold rather than short of it — so the
  > branch is reachable and the readout's fate is a design call rather than a
  > cleanup. The measured circulation ladder is in
  > `2026-08-07-nitrification-on-air.md`.

---

## Anchors

The four permissive anchors hold on the shipped branch: the cycle completes in
15–35 days at every volume, mass conservation holds end-to-end, a sane preset
survives 90 days, nothing runs away. `npm test` 2592 passed / 148 files,
`npm run typecheck` clean on all three configs, `npm run lint` clean apart from
the 3 standing `no-console` warnings.
