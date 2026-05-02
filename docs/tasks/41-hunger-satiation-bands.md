# Task 41: Satiation bands — five-zone hunger model and bar-free UI

**Status:** completed

## Overview

The current hunger model has a single stressor (above 50%) and a single
benefit (below 30%) on a "0 = full, 100 = starving" axis. It works,
but it's missing the top half of the picture: there's no penalty for
overfeeding the fish itself (only the orthogonal tank-side ammonia
spike from `decay.ts`), no eating-past-full behaviour, and the linear
stressor doesn't distinguish "a bit hungry" from "starving for days."

This task replaces the two-zone model with a five-band satiation model
that fits cleanly into the existing vitality framework — one continuous
piecewise-linear contribution across the whole range, with band labels
that exist only for UI. It also retires the hunger bar in favour of a
status-label UI, because a bar fights the gameplay goal: a player
trained by a bar wants to top it up, but the optimal play is to keep
fish in the well-fed band (≈ 80% full), not at 100%.

## References

- `src/simulation/systems/fish-health.ts` — current hunger
  stressor + benefit, lines 175–254.
- `src/simulation/systems/metabolism.ts` — eating logic, hunger
  decay, food consumption.
- `src/simulation/systems/decay.ts` — uneaten food → waste → ammonia
  (orthogonal cost, **not modified by this task**).
- `src/simulation/config/livestock.ts` — `hungerIncreaseRate`,
  `hungerStressThreshold`, `hungerStressSeverity`,
  `hungerBenefitPeak`, `hungerBenefitFullThreshold`.
- `src/simulation/state.ts:305` — `Fish.hunger`.
- `docs/tasks/40-vitality-model.md` — vitality engine this plugs into.

## Concept

### Axis and naming

Rename the field from `Fish.hunger` (0 = full, 100 = starving) to
`Fish.satiation` (0 = starving, 100 = stuffed). The existing semantics
are inverted everywhere they appear. This matches the mental model of
a "hunger bar that fills as the fish eats" and removes the cognitive
whiplash of "hunger 100 = full."

The user-facing word stays "hunger" in band labels (Hungry, Starving)
where it's natural; the field name and config knobs use "satiation."

### Five bands

| Satiation | Label     | Vitality contribution |
|-----------|-----------|-----------------------|
| 100 → 90  | Overfed   | stressor              |
| 90  → 75  | Well fed  | benefit               |
| 75  → 50  | Peckish   | neutral (no contribution) |
| 50  → 25  | Hungry    | stressor              |
| 25  →  0  | Starving  | stressor (steep)      |

Bands exist as **UI labels only**. Internally the contribution is one
continuous piecewise-linear function; band boundaries are the inflection
points of that function, not gates.

### Eating dynamics

Simplified model: a fish eats whenever food is present in
`resources.food`, until its satiation reaches 100. There is no
voluntary stop at 90. Overfeeding is a player-skill failure mode —
dump too much food, fish gorges, fish suffers from being overfed
(plus the existing tank-side ammonia spike via food decay).

### Vitality wiring

Emit a single signed satiation contribution as either a stressor or a
benefit factor (depending on which band the fish is in). The shape is
continuous and piecewise-linear with these anchor points:

- `s = 100` → overfed stress at peak
- `s = 90`  → zero
- `s = 82.5` (mid well-fed) → well-fed benefit at peak
- `s = 75`  → zero
- `s = 50`  → zero (peckish band has no contribution)
- `s = 25`  → hungry stress at "moderate" severity
- `s = 0`   → starving stress at "severe" severity

Linear ramps connect adjacent anchors. Specific peak severities are
calibration-time choices — see the **Calibration anchors** section
below for the targets.

### UI

Remove the hunger bar from `FishCard`. Replace with a status label
("Well fed", "Peckish", "Hungry", etc.) that includes a subtle
in-band progress indicator so the player can read "still well fed
but trending toward peckish." Implementation pick — pick one and
ship; it's stylistic and tunable later:

- Color depth or opacity within the label
- A small caret or arrow indicating direction
- A single dot inching across the label width

The vitality breakdown row for "Hunger" / "Well fed" continues to show
a numeric ±%/h; the bar is the only thing being removed.

## In scope

### Field rename and migration

- Rename `Fish.hunger` → `Fish.satiation` in `state.ts`.
- Invert all readers/writers: `metabolism.ts` (eating reduces
  emptiness becomes eating increases satiation), `feed.ts`,
  `fish-health.ts`, all tests, all UI.
- Persistence: this is a breaking save format change. Per project
  policy (no backwards compatibility), bump or wipe stored sessions
  rather than writing a migration shim.

### Vitality contribution

- New helper `satiationContribution(satiation, config) → { stressor, benefit }`
  in `fish-health.ts` (or a dedicated `satiation.ts` module if that
  reads cleaner).
- Replace the existing `hunger` stressor + `Well-fed` benefit entries
  in `buildStressors` / `buildBenefits` with one entry on each side
  driven by the new helper. Inactive side returns `0` so the breakdown
  shape stays stable for tests/UI that key on factor name.
- Stressor label in vitality breakdown is band-aware: "Overfed",
  "Hungry", or "Starving" depending on which side the fish is on.
  Benefit label is "Well fed."

### Config

Replace the existing four hunger knobs with band-edge knobs in
`LivestockConfig`. The new shape (suggested names):

- `satiationOverfedFloor: 90` — top of well-fed / bottom of overfed
- `satiationWellFedFloor: 75` — top of peckish / bottom of well-fed
- `satiationHungryCeiling: 50` — top of hungry / bottom of peckish
- `satiationStarvingCeiling: 25` — top of starving / bottom of hungry
- `satiationOverfedSeverity` — peak stress at satiation = 100
- `satiationWellFedPeak` — peak benefit at mid-well-fed (~82.5)
- `satiationHungrySeverity` — stress at satiation = 25
- `satiationStarvingSeverity` — stress at satiation = 0

Add to the constants tuner panel (`livestockConfigSchema`).

### Eating logic

`processMetabolism` already prioritises hungriest fish first; the
priority direction inverts (lowest satiation = hungriest). Eating
continues until `satiation >= 100` rather than stopping at "full"
(satiation = 100 is now the hard cap, overfeeding is achieved by
the gap between "naturally settles at 90 from species behaviour" and
"the player keeps dumping food in").

`hungerIncreaseRate` is renamed `satiationDecayRate` and inverted in
direction (decreases satiation over time, same magnitude).

### UI

- Remove the hunger bar from `FishCard` (and any tank-overlay /
  livestock panel that renders it).
- Add the status-label component with sub-band progression hint.
- Vitality breakdown rows continue to render — the bar is the only
  thing removed.

## Out of scope

- **Tank-side overfeeding cost** — already handled by `decay.ts`
  (uneaten food → waste → ammonia → vitality). Do not double-cost.
- **Species-specific band thresholds.** All fish use the same band
  edges for now. Per-species overrides can land later if calibration
  shows wide variation in metabolism.
- **Surplus consumption from being well-fed.** Vitality already banks
  surplus from net-positive ticks; how breeding consumes it is a
  separate task.
- **Feeding schedule actions** (auto-feeder equipment, scheduled
  feeds). Manual `feed()` action is the only input path being
  modified.
- **Visual fish-state cues** (a stuffed fish looks bloated, a
  starving fish looks gaunt). Pixi-side polish, separate task.

## Calibration anchors

The new curve must keep the existing four canonical scenarios
broadly valid. Specifically:

- A fish in the well-fed band with otherwise good conditions should
  net positive %/h (banks surplus), matching today's behaviour.
- A fish at the bottom of the hungry band (~25) should lose
  condition at roughly the same rate the current model loses it at
  hunger ~75 (i.e., the existing "moderately stressed" rate).
- A fish in the starving band should lose condition fast enough that
  ~24 hours past entering the band starts visibly threatening
  survival (today's linear scale doesn't sharpen — the new curve
  does).
- Overfed-stress severity should be tuned so that *sustained*
  overfeeding (player ignores warning) costs condition over hours,
  not minutes — the punishment is a slow drift, not a cliff.

Specific numbers are a calibration pass, not a spec call.

## Implementation

1. **Rename and invert.** Field rename + readers/writers + tests.
   This is the biggest mechanical change; do it as the first commit
   so subsequent work sits on a clean axis.
2. **New contribution helper.** Pure function, unit-test the curve
   shape directly.
3. **Wire into vitality.** Replace existing entries in
   `buildStressors` / `buildBenefits`.
4. **Config replacement.** Drop old knobs, add new band knobs, update
   the tuner schema.
5. **Eating loop.** Adjust `processMetabolism` for the new direction
   (eat to 100, decay downward).
6. **UI rework.** Remove bar, add status label.
7. **Calibration spot-check.** Run the four canonical scenarios; if
   any drift beyond their primary anchors, tune severities (don't
   ship visibly broken baselines).

Per project convention: small commits, branch per task, lint clean,
tests covering each band's contribution and the boundary transitions.
Add a `CHANGELOG.md` entry on completion.

## Acceptance Criteria

- `Fish.satiation` replaces `Fish.hunger` everywhere; no references
  to the old field remain.
- A fish at satiation = 95 has an active overfed stressor and no
  well-fed benefit.
- A fish at satiation = 82 has an active well-fed benefit and no
  hunger stressor.
- A fish at satiation = 60 has neither (peckish, neutral).
- A fish at satiation = 30 has an active hunger stressor; severity
  scales with how far into the band it is.
- A fish at satiation = 10 has an active starving stressor;
  severity is steeper than at satiation = 30.
- Curve is continuous: at the four band boundaries the contribution
  passes smoothly through zero (no cliffs).
- Eating with abundant food drives satiation to 100 (overfeeding is
  reachable via the normal eating loop).
- `FishCard` no longer renders a hunger bar; status label conveys
  the current band with sub-band progression.
- All four canonical calibration scenarios still land within their
  primary anchors; if any need re-tuning, document the change in
  `docs/calibration/`.

## Tests

Unit:
- Contribution helper: stressor / benefit values at each band's
  endpoints and midpoints.
- Continuity: contribution is zero at satiation = 90, 75, 50.
- Eating: fish at low satiation with abundant food reaches 100.
- Eating: hungriest fish (lowest satiation) is served first.
- Decay: satiation decreases over time at `satiationDecayRate`.

Integration:
- Fish in clean conditions and low satiation recovers to well-fed
  band when fed; vitality net rate flips positive once satiation
  enters the well-fed band.
- Fish ignored for several days: satiation drops through bands;
  visible condition decline accelerates upon entering the starving
  band.
- Sustained overfeeding (food repeatedly added every tick): fish
  reaches satiation = 100 and condition drifts down at the
  overfed-severity rate, even with no other stressors.

## Notes

- The user-facing word "hunger" stays in band labels because that's
  what reads naturally to a player ("Hungry", "Starving"); the field
  name and config use "satiation" for internal clarity. If this feels
  inconsistent in code review, push the question.
- The decision to drop the bar is deliberate UX: a bar primes "fill
  it up" and that fights the gameplay goal of keeping fish in the
  well-fed band, not the overfed one.
- This task does not touch breeding, even though well-fed surplus
  is the obvious feed-in to a future breeding gate. Breeding is its
  own task.
