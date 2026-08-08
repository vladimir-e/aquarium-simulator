# What moves when starvation eats tissue: the ledger split

Date: 2026-08-13 · Branch: `light-deficiency` @ `a2093e9` against the same
branch @ `f489972`

`2026-08-12-ordinary-tanks.md` is the gate this pass had to beat. Every figure
below is the same three probes on the same seeds — `npm run probe:ordinary-tanks`,
`probe:dark-tank`, `probe:starvation-share` — so "before" is that document's
branch column and nothing else has moved between them.

**Suite green on both sides: 153 files, 2688 tests.**

---

## 1. The blackout, which is what the mechanic was built for

`probe:dark-tank`, 40 L, one plant at size 35, every channel but light held at
optimum. Day the plant leaves the tank:

| species | never lit, before | never lit, after | blackout d30, before | blackout d30, after |
|---|---|---|---|---|
| anubias | **alive, c67.5** | d59 | **alive, c90.8** | d87 |
| java fern | **alive, c51.9** | d49 | **alive, c79.3** | d77 |
| amazon sword | d76 | d30 | **alive, c22.0** | d50 |
| dwarf hairgrass | d56 | d22 | d74 | d42 |
| monte carlo | d56 | d22 | d72 | **d40** |

Five species out of five now die in permanent darkness; three did before. A
blacked-out monte carlo goes in **10 days** where it took 42, and the roster
spread from lights-out to death is 10 d to 57 d — 5.7×, out of hardiness and
bank size alone.

The trace is the claim, and it is the design's:

```
      before                                after
d 34  size 81.4  cond 100.0  bank 2.4       size 81.4  cond 100.0  bank 3.3
d 35  size 81.4  cond 100.0  bank 0.2       size 81.4  cond 100.0  bank 1.5
d 36  size 81.4  cond  97.8  bank 0.0       size 69.0  cond 100.0  bank 0.0
d 37  size 81.4  cond  95.4  bank 0.0       size 42.5  cond 100.0  bank 0.0
d 39  size 81.4  cond  90.5  bank 0.0       size 16.1  cond 100.0  bank 0.0
d 40  size 81.4  cond  88.1  bank 0.0       size  0.0  cond   0.0  bank 0.0
```

Condition never moves. The bank drains, then the plant melts, then it is gone —
death by size, with `deathConditionThreshold` never involved.

Two marginal photoperiods stop being parked and resolve: a monte carlo on 6 h
sat at condition 54.6 for 90 days and now dies on d52; dwarf hairgrass on 4 h
sat at 26.8 and now dies on d37. There is no longer a condition a plant can
idle at while failing to pay for itself. 8 h and 12 h both still hold every
species at good PAR, and the PAR a whole day balances under fell slightly for
all five (monte carlo 31.6 → 29.3, anubias 3.7 → 3.3).

---

## 2. The transient outage, which is the gate's sharpest measurement

A perfect bright tank, one fertiliser outage starting at day 14, the tank put
right after. Size and condition at d90; `main` is from the gate document.

| species | days out | `main` | before | after |
|---|---|---|---|---|
| anubias | 14 | c100, — | c100, 71.6 | c100, 72.3 |
| anubias | 21 | c100, — | c100, 67.1 | c100, 68.3 |
| java fern | 14 | c100, — | c100, 91.5 | c100, 93.3 |
| java fern | 21 | c100, — | c100, 82.6 | c100, 85.6 |
| amazon sword | 7 | c100, 211.4 | c100, 136.2 | c100, 142.7 |
| amazon sword | 14 | c100, 195.0 | c100, 79.1 | c100, 70.4 |
| amazon sword | 21 | c100, 179.3 | **died d29** | **died d30** |
| dwarf hairgrass | 7 | c100, 288.6 | c100, 136.0 | c100, 150.2 |
| dwarf hairgrass | 14 | c100, 257.0 | **died d24** | **died d25** |
| monte carlo | 7 | c100, 338.0 | c100, 156.0 | c100, 174.6 |
| monte carlo | 14 | c100, 300.3 | **died d24** | **died d25** |
| monte carlo | 21 | c100, 261.9 | **died d24** | **died d25** |

**The 14 d bar is not met, and it cannot be met from this unit.** The arithmetic,
for a monte carlo under a fixture at twice its band low with nutrients held at
zero:

```
income      tanh(60/60) × 3 × 0.125           = 0.286 %/h, 12 h a day  → 3.43 /day
nutrient    0.7 × (1 − 0) × (1 − 0.3)         = 0.490 %/h, 24 h a day  → 11.8 /day
upkeep      0.075 × (1 − 0.3)                 = 0.053 %/h, 24 h a day  →  1.26 /day
```

Condition falls 9.6 points a day for as long as the outage runs, and no
arrangement of the ledgers changes that — the deficit is `nutrientDeficiencySeverity`
against a light-gated income, and starvation never enters it. `probe:starvation-share`
confirms it directly: zeroing both new stressors moves the carpets' death from
d25 to d27. Surviving a fortnight needs the daily deficit at or under 6.4, which
is `nutrientDeficiencySeverity` ≈ 0.45 for this species. That constant is the
next pass's, and this run is the number it should be re-derived against.

What the split *did* buy on this table: every recoverable case recovers with
more plant than before (monte carlo 7 d: 156 → 175), and anubias and java fern
hold condition 100 through all four outage lengths.

---

## 3. The interaction that was killing hardy plants

Light held at twice the species' band low, one *other* channel taken away and
held away for the whole 90 days.

| species | deprived | `main` | before | after |
|---|---|---|---|---|
| anubias | nutrients | 63.5, c100 | **died d85** | **36.5, c50.7 — alive** |
| java fern | nutrients | 76.1, c100 | died d51 | died d70 |
| amazon sword | nutrients | 35.0, c74.3 | died d16 | died d15 |
| dwarf hairgrass | nutrients | died d25 | died d10 | died d12 |
| monte carlo | nutrients | died d25 | died d10 | died d12 |

Anubias comes back from the dead. The rest of the column is the nutrient
severity again, unchanged.

---

## 4. Scenario 02 variant A: the fish come back

38 L as the scenario specifies it, 5 plants, 10 neon tetras, 1 ml/day dosed,
90 d. Identical on rng seeds 5, 1234 and 4242.

| | `main` | before | after |
|---|---|---|---|
| planting at d90 | 424.9 | 299.7 | 337.0 |
| mean condition | 100 | 50.9 | 98.8 |
| bank | 29.7 | 0 | 15.9 |
| **fish** | 10 of 10 | **0 of 10, lost d81.3–d83.3** | **10 of 10** |
| NO₃ | 32.4 | 58.9 | 42.7 |
| algae | 5.6 | 45.4 | 35.9 |

The cascade the gate found — smaller planting, less nitrate uptake, nitrate past
40 ppm, algae past its shading threshold, every neon gone inside 48 hours — is
pushed out past the window: run to 120 days the neons now start going on d98.4
instead of d81.3. It is deferred, not solved, and what defers it is 12 % more
planting holding condition 98.8 instead of 50.9.

Variant B: the swords now last to d37 rather than d24.

---

## 5. Where it costs

Two regressions, both in the same direction — a plant with chronic damage now
loses condition at the full rate rather than behind a buffer, so a tank that was
slowly starving its plants kills them sooner.

**The `betta` preset loses its ferns at d50, and then its fish.** Before: three
java ferns alive at d90 at condition 63.2, one neon alive. After: ferns dead
d50, and the neon dies on d52.5 in the ammonia spike three plants' worth of
death waste makes in 20 L. The plant deaths are `nutrientDeficiencySeverity` in
an undosed nano (NO₃ 0.9 ppm all run); the fish death is a real second-order
consequence of them, and it is new to the 90-day window.

The `planted` preset moves the other way — its java ferns go on d68 rather than
d55, and d66 rather than d54 with weekly water changes.

**A fixture below the species' band now melts the plant instead of parking it.**
Amazon sword at 0.75 × its band low read 47.3 at condition 82.5 and now dies on
d51; the two carpets there went from d63/d70 to d16/d17. Inside the band every
species ends *larger* than before (monte carlo at band low 124 → 145.8, dwarf
hairgrass 108.1 → 127.4), so the dose–response is sharper on both sides.

Unchanged, byte for byte: the five-volume sweep (1110.0 / 1092.1 / 1066.8 /
1031.6 / 983.5) and the 365-day full-bank extreme, which still ends every
species at `main`'s size to the decimal. Nothing here touches a tank with no
complaint.

---

## 6. The two open questions, settled by measurement

**Does environmental damage reach tissue too?** No — exclusively the energy
ledger's. Routed through the same shedding outlet, a health deficit is five to
twenty times the size of the upkeep bill, so it saturates the shed rate on the
first tick: a permanently nutrient-free anubias dies on **d5** against d85
before and 90 days alive on `main`, and a 7-day fertiliser outage kills every
species on the roster. Even a well-kept tank shrinks — the lit control loses
2 % of its carpet to passing deficiencies.

**Does the tissue rate fall out of the shortfall, as the mirror of
`sizePerSurplus`?** No, and the reason is worth keeping. Converting the unpaid
bill back into tissue at `growthRate × sizePerSurplus` charges a blackout about
a tenth of what growth invested, because upkeep is a tenth of the growth draw:
measured, a never-lit **anubias is still alive at 90 days** at size 31.5 and
condition 100, and so are a never-lit java fern and a blacked-out sword. That is
register defect #37 in a new costume. The mirror assumes tissue is *digested*;
what a starving plant actually does is *abscise*, and the abandoned leaf's energy
goes to the substrate — which is what `wastePerShedSize` has always said. So the
rate is a share of the plant per hour, and `maxSheddingRate` keeps its 0.02 with
a new referent: the share a plant sheds when it pays none of its bill.

## 7. `starvationMultiplier` has stopped doing anything

With shedding reading the *share* of the bill left standing, the multiple
scales both sides of that ratio and cancels out of the melt entirely. All it
does now is make the last of a bank go faster than the first of it. Measured
across the roster, blackout death day:

| multiplier | anubias | java fern | sword | hairgrass | monte carlo |
|---|---|---|---|---|---|
| 0 | d88 | d78 | d52 | d43 | d41 |
| 1 (shipped) | d87 | d77 | d50 | d42 | d40 |
| 3 | d86 | d76 | d49 | d41 | d39 |

One day, in either direction, for a 3× move. `probe:starvation-share` says the
same on the outage and the preset runs: `shipped` and `no starvation` are
identical for anubias, java fern and the `planted` preset, and ±1 day for the
carpets.

The term is not dead code — the reserve line it ramps from is unpinned, and a
longer one would make it bite — but at the shipped `starvationReserveHours` it
is decoration. §9 either pins it or drops it and its two constants with it.
