# System status — what to trust

In the source, a crystallized decision and a proof-of-concept look identical. This file is the sorting. The test is the design philosophy itself — **rates into stocks is settled; bands and switches are scaffolding** — with the caveat that a band edge where a rate *starts from zero* is a rate, and death is a real discontinuity. Mechanics are named on purpose: a redesign renames things, so a row naming a mechanic that no longer exists is self-evidently stale and should be resolved rather than trusted.

**Gates are what's being removed, not what's absent.** Four switches are still live and none of them is intent: the plant's light-insufficient *and* CO₂-insufficient stressors both gate on `light > 0` (`plant-vitality.ts`), so a carbon-starved plant swings between 0 and 9 %/h as the lamp flips while its benefits ramp smoothly; surplus accrual gates the same way, in plants and again in algae; and the nitrifier guilds jump 0 → full inoculum the instant `pop === 0 && ppm ≥ 0.5`. **`satiation.ts` is what the right shape looks like** — one continuous piecewise curve producing both a stressor and a benefit, zero at every band edge. It's already in the repo; point at it rather than inventing the shape again.

## Deliberate absences — don't re-propose

- **Hardiness scales stressors only** — a hardy fish tolerates bad water but isn't more energized by good.
- **Outcomes spend the stock, they never re-test conditions.** Breeding gates on whether surplus *filled*; the husbandry is already priced into how it got there. Never add a husbandry switch to an outcome.
- **There is no condition-equilibrium term and its absence is deliberate.** Behaviour reading as "everything dies eventually" is severity constants too harsh at the margin — a real defect, but a number, never a missing mechanism. Better ideas are welcome; proposing one as a *passing fix* is the failure.

## Settled — changing one is a design conversation, not a refactor

| System | The commitment |
|---|---|
| `computeVitality` | `net = Σbenefits − (Σupkeep + Σstressors) × (1 − hardiness)`. Recover-then-grow, no middle-parking — the absence of a condition-equilibrium term is deliberate |
| `bankSurplus` / `spendableSurplus` | Surplus buffers damage and pays upkeep, with a reserved depth damage may not spend. Outcomes spend the stock, never re-test the conditions that filled it — breeding's one guard is that the female's net is ≥ 0 *this tick*, which tests trend, not husbandry |
| the two ledgers (`upkeep` vs stressors) | Energy deficits are paid in tissue, environmental stress in condition. A starving plant shrinks and survives |
| `lightSaturationFactor`, PAR at substrate | `surfacePar × exp(−k·depth)`, then `tanh(PAR/Ik)`. Light **multiplies** the whole plant benefit budget |
| `core/chemistry.ts`, `monodFactor` | Systems return a mass, the resource layer divides by volume. One carbon yield, O₂ at 32/44. Every aerobic path is Monod-limited on oxygen |
| nitrogen cycle | The ammonia source is a physical, depleting bed reserve rather than a flat constant, and the colony grows and decays on its own work. *(Not mass-conserving: decay oxidation, plant uptake and metabolic retention are untracked N sinks — see `n-mass-conservation.test.ts`.)* |
| `satiation.ts` | Bands as inflection points, not switches — the shape the tolerance bands should copy |
| `decay.ts`, `metabolism.ts`, `temperature-drift.ts` | Q10 × Monod on food→waste; fish O₂ draw, deamination and CO₂ on one oxygen factor; Newton's cooling with a volume exponent |
| fish lifecycle | Age as a linear stressor ramp (the cliff is gone), `fry`/`adult` staging, mass-for-age |
| `PresetSeed`, the rng seam | Serializable randomness, `Math.random` nowhere in `src/`. Seeding a state a keeper couldn't reach is worse than not seeding |
| equipment: flow-as-turnover, surface-as-colony-ceiling | Settled; the rest of the equipment layer is unaudited |

## Scaffolding — predates the abstraction; don't build on it, defend it, or preserve its behaviour. Its tests pin a placeholder

| System | What's wrong |
|---|---|
| nutrients | **The weakest thing in the engine — every number is a placeholder.** Sufficiency is `min(1, ppm/required)`, and the measured consequence is not hypothetical: a java fern in the shipped `planted` preset sits at sufficiency **0.011–0.015** — 99 % starved — reading condition 100. Not a Liebig minimum either: a required/booster split by demand tier, so a low-demand species is *completely indifferent* to potassium and iron. `UPTAKE_MAINTENANCE_FRACTION` is a magic number inline in `photosynthesis.ts`, justified by one scenario |
| the doser | Uptake reads the same `fertilizerFormula` the doser meters by, so **the doser cannot correct an imbalance it did not create**; only nitrification and decay move the ratio |
| `co2Factor` / `optimalCo2` | A hard linear ramp — low-tech runs at a fifth. Scope matters: it touches photosynthesis and uptake only; plant *health* reads carbon through `inRangeBenefit`, which pays full peak at 4 mg/L for low-demand species, which is why low-tech presets thrive anyway |
| `inRangeBenefit` | A step, by its own docstring. Crossing a tolerance edge loses the whole benefit at once *and* starts damage |
| photoperiod gates | The largest surviving discontinuity — see the four live switches above |
| algae | Moves no gas at all, and fights plants through two mirror-image threshold terms. *(It does bank a reserve, and it does read light — but only as a capped ramp above 70 PAR, never as photosynthetic drive.)* |
| pH | `co2PhCoefficient` is an admitted stand-in for alkalinity, and `calculateHardscapeTargetPH` is a hand-coded per-item lookup with no acid/base stock |
| plant `size` / `maxSize` | Drifted into biomass under a ceiling whose docstring admits it does nothing; `trimPlants` still validates `[0, 100]` against a ceiling of 600–1100 |
| alerts | **Four wrong quantities, not two** — ammonia on TAN where toxicity is unionized; nitrate at 80 where damage starts at 40; nitrite at 1.0 where damage starts at any presence; oxygen at 4.0 where damage starts below 5 |
| inert beds | Every bed leaches and every bed has colony surface — *the defect is colony sizing*: `'cycled'` hands gravel and sand a soil tank's colony, and they don't clear a dose at day 30 |
| evaporation | `LID_MULTIPLIERS` is a hardcoded lookup outside `config/` |
| presets | Equipment and a cycled filter, no livestock or flora. **Stocked single-sex, all four are survivable** — the wipeouts are the breeding runaway below, not the presets |

## Missing — the first two aren't future features; their absence distorts what's next to them

| Absent | What it breaks |
|---|---|
| **KH — carbonate hardness** | Buffer *capacity* (pH relaxes toward a target, but `co2PhCoefficient` is a flat constant standing in for alkalinity, as its own docstring admits) *and* the bicarbonate carbon low-tech plants run on. **No value of `optimalCo2` can be right** — a single dissolved-CO₂ target standing in for a two-pool carbon system |
| **GH — general hardness** | Ca/Mg: species tolerance, plant nutrition, invert shells, livestock health. Zero hits in `src/` |
| **Predation** | Eggs hatch at 100 % with no density check, so **any stocked preset breeds itself to a wipeout inside 90 days.** This is the cause of most "preset is broken" findings |
| supersaturation ceiling | Resisted only by the same linear relaxation as undersaturation, then truncated by a resource bound that silently discards oxygen mass. No ebullition |
| colonies · log retention | Shrimp/snail populations; `logs` has 19 push sites and no trim |

*The actions layer is unclassified, and worth classifying before anyone works there.*
