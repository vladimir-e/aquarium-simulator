# The reserve, held against the claim that was reaching under it

Date: 2026-08-08 · Branch: `light-deficiency`, against the same branch @ `781ea06`

Same three probes, same seeds: `npm run probe:ordinary-tanks`,
`probe:dark-tank`, `probe:starvation-share`. "before" is the branch head; every
figure below is the same code on both sides.

**Suite green: 153 files, 2700 tests. No anchor widened, conditioned or edited.**

---

## 1. The defect

`upkeepReserveHours` made the bank a *reservation*: damage may spend only what
stands above `upkeepRate × upkeepReserveHours`, so a lit plant under mild stress
loses condition rather than eating its survival rations.

`spendSurplus` drew from the whole bank. So repair — which runs the tick after
damage, out of the same bank, ahead of growth — reached under the line and gave
back the condition damage had just taken, paid for out of the rations. The floor
held for exactly one hop: the ration was spent anyway, one tick later, through
the back door, and the plant starved and shed after.

The fix is one line of arithmetic in each of two places and one definition:
`spendableSurplus(bank, reserved)` in `vitality.ts`. `bankSurplus` bounds a
tick's damage by it; `spendSurplus` bounds its withdrawal by it. `computeVitality`
publishes the depth as `breakdown.reserved`, so the number is computed once and
handed to the claimant rather than re-derived by each.

The mobilisation itself is unchanged — a plant still mobilises
`growthDrawRate` of its bank. What changed is that the withdrawal is capped:

```
mobilised = min(max(0, bank − reserved), bank × growthDrawRate)
```

which is the exact shape `bankSurplus` already used for damage — a demand
bounded by what is spendable, not a demand rescaled by it. It bites only when
the bank is within one hour's draw of the floor, which is the only regime the
defect lived in.

## 2. Should the floor read the current tick's upkeep, or a stable figure?

Upkeep is Q10-scaled, so a warm tick raises the floor. The worry is chatter: a
warm hour making the previous hour's spendable surplus unspendable.

Measured, over the lit hours of eight runs — `floor` in banked units, `step` the
largest hour-to-hour move in it:

| tank | t range °C | floor | largest step | as % of floor |
|---|---|---|---|---|
| heated 25 °C, held at optimum (mc) | 25.00–25.00 | 5.250 | 0 | 0 |
| scenario 02 tank, unheld (mc) | 25.00–25.00 | 5.250 | 0 | 0 |
| unheated, room-tracking (mc) | 21.98–22.62 | 4.258–4.451 | 0.034 | 0.77 % |
| heated 28 °C (mc) | 27.93–28.00 | 6.432–6.464 | 0.032 | 0.50 % |
| heated 30 °C, mc out of band | 29.91–30.00 | 7.377–7.425 | 0.047 | 0.64 % |

**The Q10 term is a level, not a jitter.** Between tanks the floor spans
4.26 → 7.43 (+74 %); *within* any one tank it moves under 1 %, because
temperature is a slow variable here — a heater holds its setpoint to 0.07 °C and
an unheated tank drifts with the room over hours, both far slower than the
hourly tick. One hour's withdrawal is 2 % of the bank, 0.1–1.0 units; a
0.03-unit wobble in the floor is an order of magnitude below it.

Nor is it retroactive in any harmful sense: a floor rising above the bank makes
`spendableSurplus` return 0 and nothing happens. No stock is rewritten. The
plant declines to build tissue for the hours it is holding less than its
rations, which is the rule working.

Run for outcome as well as for movement — every probe re-run with the floor
quoted at `respirationReferenceTemp` instead (`upkeepCost × (1 − hardiness) ×
upkeepReserveHours`, no Q10):

- `starvation-share`: **identical**, every row.
- `dark-tank`: three figures move in the third significant digit (mc on a 4 h
  photoperiod 20.8 → 21.7, on 6 h 79.9 → 79.7; hairgrass on 4 h 51.2 → 51.0).
  No death, no survival, no compensation point changes.
- `ordinary-tanks`: one death day moves by one (`planted` hi-tech monte carlos
  d31 → d30) and two banks move by 0.1–0.5.

So the two policies are empirically indistinguishable, which means the choice
is decided on which is *right*: **the current tick's rate**. It is the number
the rest of the ledger already runs on — damage is bounded by it, `starved` is
quoted against it — and a stable figure would be a second, disagreeing
definition of one line, which is the class of defect this fix exists to close.
It is also the honest reading of the constant's own units: `upkeepReserveHours`
buys *hours*, and a warm plant burns its ration faster, so buying the same
duration costs more units.

---

## 3. What the fix moves

### The extremes that have to stay safe

The 365 d full-bank run is **byte-identical** — every species still ends at
`main`'s size to the decimal (386.2 / 468.8 / 714.4 / 1002.4 / 1039.5), and the
five-volume sweep does not move a digit. The floor is 5.25 units against a bank
pinned at the 50-unit cap, so it never binds there, which is the null this
formulation was chosen to produce.

Blackout and never-lit are **unmoved**, every species, every trace row: spending
is photoperiod-gated, so in permanent darkness `spendSurplus` never runs.

### The marginal end, undosed, 180 d

`planted` and `betta`, 3 java fern + 2 anubias, no doser, no water changes —
the run `nutrientDeficiencySeverity` is pinned at 0.30 on. **Identical:**

| preset | size | alive | condition | fish |
|---|---|---|---|---|
| `planted` 40 L | 381.3 | 5 | 100 | 6 |
| `betta` 20 L | 224.1 | 5 | 95.8 | 1 |

It now has a probe — `ordinary-tanks.ts` § `marginal` — because the sweep that
produced it originally was deleted with its derivation.

### Scenario 02 variant A

367.6 at d90, **all ten neons alive**, on all three rng seeds; the two monte
carlos still go on d78. Only NO₃ and algae move (38.1 → 39.3 ppm, 27 → 26.1).
Variant B's monte carlos last to d21 rather than d16.

### Fertiliser outages — the case the line exists for

`transient`, size at d90 (a good tank, one outage at day 14):

| species | days out | before | after |
|---|---|---|---|
| dwarf hairgrass | 7 | 192.9 | 192.9 |
| dwarf hairgrass | 14 | 124.4 | **167.2** |
| dwarf hairgrass | 21 | **died d35** | **106.3, c100** |
| monte carlo | 7 | 224.1 | 224.1 |
| monte carlo | 14 | 146.4 | **193.4** |
| monte carlo | 21 | 98.8 | **124.0** |

Anubias, java fern and amazon sword are unchanged at all three lengths. The
seven-day outage is unchanged for the whole roster — a plant that never runs its
spare down does not care where the floor is.

**Three weeks without fertiliser is now survivable for the whole roster.** The
branch's cliff at three weeks was the back door: the hairgrass was spending its
rations on repair and then having nothing to pay the night with.

### The permanent deprivations

`compound` — bright light, one channel taken away and held away, 90 d:

| species | before | after |
|---|---|---|
| amazon sword, no nutrients | died d85 | died d84 |
| dwarf hairgrass, no nutrients | died d19 | **died d28** |
| monte carlo, no nutrients | died d19 | **died d28** |

`establish` — a new plant under a fixture too dim for it. The bank lasts longer
and the plant lives longer, and **condition slips earlier**, because damage is
no longer masked by a repair paid out of the rations:

| species | par | bank empty | cond slips | died |
|---|---|---|---|---|
| amazon sword | 10 | 11 → **15** | 9.7 → **6.5** | d17 → **d21** |
| dwarf hairgrass | 12.5 | 8.3 → **12** | 4.3 → 4.3 | d14 → **d18** |
| dwarf hairgrass | 18.8 | 14.3 → **36.3** | 11.2 → 11.2 | d34 → **d61** |
| monte carlo | 15 | 8.1 → **12** | 3.7 → 3.6 | d14 → **d18** |
| monte carlo | 22.5 | 12.1 → **19.2** | 11.2 → 11.2 | d22 → **d30** |

That pair of directions is the fix stated in observables: condition becomes an
honest early warning, and the ration becomes real survival time.

### Photoperiod, and the fixture a whole day balances under

| species | `holds above`, before | after |
|---|---|---|
| anubias | 2.5 PAR | 2.3 |
| java fern | 3.7 | 3.5 |
| amazon sword | 13.1 | 12.7 |
| dwarf hairgrass | 20.3 | 20.3 |
| monte carlo | 25.0 | 25.0 |

A monte carlo on a **4 h** photoperiod now lives (20.8, condition 100) where it
died on d66. The hour-for-hour compensation point (`net = 0`) is untouched —
it never read the bank.

### The growth this costs

Nowhere is a thriving tank slower. The withdrawal is only capped within one
hour's draw of the floor, and a plant in that regime was previously *burning
its rations*, so the trade shows up as survival rather than as size. The whole
measured cost, across every probe:

| run | before | after |
|---|---|---|
| dwarf hairgrass, 4 h photoperiod | 53.4 | 51.2 (−4.1 %) |
| monte carlo, 6 h photoperiod | 80.6 | 79.9 (−0.9 %) |
| amazon sword, 0.75 × band low | 67.2 | 66.9 (−0.4 %) |
| scenario 02 variant B, d90 | 175.7 | 173.9 (−1.0 %) |

Every other size in every probe is unchanged or larger. Nothing that thrived
stops thriving.

---

## 4. `nutrientDeficiencySeverity` stays at 0.30

Its docstring names a reference the fix moved, so the reference is re-measured
rather than the constant. Monte carlo under a fixture that suits it, in water
with no nutrients at all, 180 d:

| severity | before | after |
|---|---|---|
| 0.20 | d81 | d79 |
| 0.25 | d51 | d48 |
| **0.30** | **d19** | **d28** |
| 0.35 | d13 | d17 |

Both ends still bind at 0.30. The severe end is weeks and not months (four
rather than three); the marginal end is byte-identical, and it is the tighter
of the two. The dose–response between them still reads as it did — monte carlo
held at a share of every optimum, 180 d:

| share of optimum | before | after |
|---|---|---|
| 1.0 | thrives | thrives |
| 0.5 | d149 | d154 |
| 0.25 | d74 | d72 |
| 0.10 | d46 | d43 |
| 0 | d19 | d28 |

Five months at half nutrition, ten weeks at a quarter, six at a tenth. The two
directions in that table are the same pair as in `establish`: where death comes
by condition it arrives a touch sooner, because damage is no longer undone from
under the line; where it comes by starvation it arrives much later, because the
ration is there to spend. The docstring's "19 days" is now 28.
