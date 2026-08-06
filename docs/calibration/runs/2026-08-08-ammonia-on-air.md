# A fish's other output reads the oxygen too

Date: 2026-08-08 · Branch: `gas-volume-stoichiometry` · Roadmap §2, subtask 2b

A suffocating fish drew less oxygen and went on excreting ammonia at full rate —
the one metabolic output in the tick ignoring oxygen entirely. It now carries
the same factor as the draw, off the same `respirationOxygenHalfSaturation`.

The biology is deamination: ammonia comes from stripping N off amino acids, and
a hypoxic fish enters metabolic depression, where protein turnover falls with
the rest of metabolism and reduced ammonia excretion is the measured behaviour.
So it is one metabolism and it gets one factor — no second constant, and no
floor. At 0.5 mg/L the factor is still 0.33, and a fish there dies long before
the number matters.

Probe: `npm run probe:oxygen-limited-draw`, third section.

---

## Both NH₃ streams, and not the feces

`processMetabolism` emits nitrogen down two paths, and the change treats them
the same way for the same reason:

- **Post-prandial** — `foodGiven × foodNitrogenFraction × gillNFraction`, the
  ingested N a fish deaminates and blows off through the gills. Scaled.
- **Basal** — `basalAmmoniaRate × mass`, body protein turnover independent of
  feeding. Scaled.

**Feces are not.** `foodGiven × (1 − gillNFraction)` is N that was never
absorbed, and the gut does not care what the gills are getting.

Neither rate is divided back up by the factor the way the three nitrifier rates
on this branch were, and the rule that decides it is the one already written in
`4-CORE-SYSTEMS.md`: a constant that claims a single figure gets re-quoted, a
constant that claims a band does not. `baseRespirationRate` quotes 0.2–0.5 mg
O₂/g/h and `basalAmmoniaRate` quotes 0.3–1.0 mg NH₃-N/g/day; at air saturation
the factor takes 0.3 to 0.268 and 0.03 to 0.0268, and both stay inside their
band. Re-quoting them would move the livestock calibration to make nothing
truer.

**The N a depressed fish does not deaminate stays in its body**, and the engine
has no body-N pool, so it leaves the accounting — the same standing
`n-mass-conservation.test.ts` already gives plant uptake. It is bounded: at most
8.5 % of the N a fish ate in air-saturated water, well inside the 60 % the
decay-oxidation floor in that test already allows for.

Both scenarios' basal term now sums the per-tick factor instead of counting
ticks, but only the fed one had to: on the counted-tick injection it lands under
its own floor, while the fasted one still passes — residual −7.93×10⁻⁴ g of N
against an 8.84×10⁻⁴ tolerance, 90 % of the budget spent on 30 ticks of breathing
the fish did 26.79 of. Summed, that scenario balances to 3×10⁻¹⁷ g, which makes
the anchor *tighter* than it was rather than looser.

## What it is worth at the tank

Twelve tetras in a cycled 40 L, fed 0.05 g/day with a quarter of the water out
each week, ninety days. **Oxygen is pinned for the whole run**, because left to
find its own level the draw's feedback moves the oxygen underneath the reading
and the rows would differ by the water as well as by the change.

**The control is close, not clean, and it is worth saying which.** It is
`respirationOxygenHalfSaturation` taken to nothing, and that constant scales the
respiratory draw as well as deamination — so the unscaled row's roster also
breathes at full rate. The pin is re-applied *between* ticks, not inside one, so
within each tick that roster strips a little more oxygen before the passive tier
reads it, and its nitrifiers work in marginally thinner water. Two mechanisms,
one of them small.

How small is measurable off the bottom pair, where the roster is dead by day
1.08 and deamination is identically zero on both sides for the remaining 99 % of
the run: 0.8 % on the nitrite peak, 0.2 % on both end nitrate and final colony
size. Against headline effects of 8–17 % the leak is about a tenth of what is
being measured, so the ordering and the magnitudes below stand — but they are
read against a control that is loose by that much.

| O₂ mg/L | excretion | gills ppm/h | NH₃ peak | NO₂ peak | NO₃ at d90 | AOB % of surface | fish |
|---|---|---|---|---|---|---|---|
| 8.38 | shipped | 0.00444 | 0.0000 | 0.0000 | 13.07 | 4.185 | 12 |
| 8.38 | unscaled | 0.00496 | 0.0000 | 0.0000 | 14.29 | 4.560 | 12 |
| 5.00 | shipped | 0.00414 | 0.0000 | 0.0000 | 12.36 | 3.967 | 12 |
| 5.00 | unscaled | 0.00496 | 0.0000 | 0.0000 | 14.27 | 4.555 | 12 |
| 2.00 | shipped | 0.00000 | 3.5674 | 7.8987 | 3.64 | 1.282 | 0 |
| 2.00 | unscaled | 0.00000 | 3.5579 | 7.8351 | 3.65 | 1.284 | 0 |

**The feedback reads as a smaller biofilter, not as standing toxins.** In an
ordinary tank the roster excretes 10.6 % less ammonia, which is 8.5 % less
nitrate after ninety days and an 8.2 % smaller AOB colony. At the oxygen a fish
starts taking damage at, 5.0 mg/L, it is 16.5 % less ammonia, 13.4 % less
nitrate and a 12.9 % smaller colony. Standing NH₃ and NO₂ do not move at all in
either: the colony grows to its load, so a smaller load is a smaller colony
rather than a cleaner tank.

**Below that the reading goes away, because the roster does.** At 2 mg/L every
fish is dead inside ninety days with the term on or off — `oxygenStressThreshold`
is 5.0 and the damage is linear in the shortfall, so the oxygen a fish suffers
at is far above the oxygen its excretion notices. The gill term is zero in both
rows and the tank is running on its bed. **So the change never rescues a tank
that was drowning**; what it does is stop the engine claiming a fish in trouble
keeps loading the water at full rate.

**Cycling itself does not move.** Every cycling anchor is measured on a fishless
tank, so the clock, the nitrite peak and the cycled day are untouched by this
change at every volume.

---

## Anchors

All four permissive anchors hold.

- **Cycle completes 15–35 days at any volume** — unchanged; the traces are
  fishless.
- **A sane preset survives 90 days** — the five shipped presets run their 90
  days without their circulation costing a fish anything, topping off either
  way, and the community preset holds its twelve tetras.
- **Mass conservation** — `n-mass-conservation.test.ts` green end to end, on a
  basal term that now sums the factor rather than counting ticks.
- **Nothing runs away** — the 90-day guard bands hold.

`npm test` 2634 passed / 151 files · `npx tsc --noEmit` clean on all three
configs · `npm run lint` clean apart from the 3 standing `no-console` warnings.

### Tests that moved, and why

None of them a widened band.

- `metabolism.test.ts` — every ammonia expectation is quoted against the water
  it is read in. The canonical 48.62 mg NH₃ per gram of food is still the
  stoichiometry; what the fixture emits is that times 8/9. The two
  food-N-conservation tests add the retained term and close exactly again, which
  is the sink stated rather than tolerated.
- `oxygen-limited-draw.test.ts` — "leaves ammonia excretion alone" asserted the
  behaviour this change reverses. It now reads the ratio between two oxygens and
  pins it to the ratio between the two draws, which is the "one metabolism, one
  factor" claim rather than a number.
- `n-mass-conservation.test.ts` — the basal injection sums `monodFactor` over
  the run instead of multiplying by ticks, in both fish scenarios though only
  the fed one needed it. Read off the state going into each tick, which is
  exactly what `processMetabolism` sees in these fixtures: livestock runs in the
  active tier and nothing ahead of it moves oxygen there.

### Found on the way

- **`cycledTank` and `fishlessTank` took a fresh RNG roll**, so anything stocked
  on top of one ran a different life every time — the probe's own rows moved by
  1.7 % between runs before this was pinned. Both now take an `rngSeed` and
  default it, so a fixture that names none still runs one tank rather than a new
  one each time.
- **Three anchors were being decided by that roll**, all of them pre-existing:
  the 40 L / 12 tetra biofilter anchor in `bacteria-colony.test.ts`, the shipped
  presets and the community roster in `flow-tolerance.test.ts` — which is the
  "a sane preset survives 90 days" anchor — and the 90-day guard run in
  `seeded-tank.test.ts`. All four permissive anchors pass at 1234, 7, 99991 and
  20260806, so the seed pins the tank rather than choosing the outcome.
