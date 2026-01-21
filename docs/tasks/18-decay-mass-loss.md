# Task 18: Decay Mass Loss with CO2/O2 Exchange

**Status:** pending

## Overview

The decay system currently converts food to waste at a 1:1 ratio. In reality, aerobic decomposition:
- Releases significant mass as CO2
- Consumes oxygen (bacteria respiration)
- Leaves only a fraction as solid waste

This task adds realistic mass loss during decay, with the "lost" mass producing CO2 and consuming O2.

## References

- `src/simulation/systems/decay.ts` - Current decay implementation
- `src/simulation/systems/gas-exchange.ts` - Gas exchange constants
- `docs/4-CORE-SYSTEMS.md` - Decay system specification

## Scope

### In Scope

- Add mass conversion factor to decay (food → waste at ~40% efficiency)
- Produce CO2 from decay (the oxidized carbon)
- Consume O2 from decay (aerobic respiration)
- Update constants with clear documentation

### Out of Scope

- Anaerobic decomposition pathways
- UI changes (existing displays handle new values automatically)

## Analysis: Why These Numbers Matter

**Example: 1g food in 100L tank at 25°C**
- Decay per hour: 1g × 5% = 0.05g
- If 60% is oxidized: 0.03g organic matter
- CO2 produced: ~30mg → 0.3 mg/L increase
- O2 consumed: ~30mg → 0.3 mg/L decrease

**At equilibrium with gas exchange (10%/hr toward target):**
- CO2 rises from 4 → ~7 mg/L (75% increase)
- O2 drops from 8 → ~5 mg/L (triggers low O2 alert!)

**Tank size impact:**

| Tank | CO2 Δ/hr | O2 Δ/hr | Effect |
|------|----------|---------|--------|
| 40L  | 0.75 mg/L | 0.75 mg/L | Dramatic |
| 100L | 0.3 mg/L | 0.3 mg/L | Noticeable |
| 200L | 0.15 mg/L | 0.15 mg/L | Moderate |

This matches real-world behavior: overfeeding small tanks causes rapid water quality issues.

## Implementation

### Constants

Add to `decay.ts`:

```typescript
/** Fraction of decaying food that becomes solid waste */
export const WASTE_CONVERSION_RATIO = 0.4;

/**
 * Gas exchange per gram of organic matter oxidized.
 * Based on aerobic decomposition: C6H12O6 + 6O2 → 6CO2 + 6H2O
 * - Food is ~40% carbon, CO2 is 3.67x heavier than C
 * - 1g food × 0.6 (oxidized) × 0.4 (carbon) × 3.67 ≈ 0.88g
 * - Simplified to 1g CO2 per g oxidized, same for O2 consumed
 */
export const GAS_EXCHANGE_PER_GRAM_DECAY = 1000; // mg per gram oxidized
```

### Decay System Changes

Modify `decaySystem.update()` to emit 4 effects instead of 2:

1. Food consumed: `-decayAmount`
2. Waste produced: `+decayAmount * WASTE_CONVERSION_RATIO`
3. CO2 produced: `+decayAmount * (1 - WASTE_CONVERSION_RATIO) * GAS_EXCHANGE_PER_GRAM_DECAY / waterVolume`
4. O2 consumed: `-decayAmount * (1 - WASTE_CONVERSION_RATIO) * GAS_EXCHANGE_PER_GRAM_DECAY / waterVolume`

Note: CO2/O2 are stored as concentrations (mg/L), so divide by water volume.

### Documentation

Update `docs/4-CORE-SYSTEMS.md` Decay section to document:
- Aerobic decomposition chemistry
- Mass conversion ratios
- CO2/O2 effects

## Acceptance Criteria

- [ ] Decay produces ~40% waste relative to food consumed
- [ ] Decay produces CO2 proportional to oxidized mass
- [ ] Decay consumes O2 proportional to oxidized mass
- [ ] CO2/O2 changes scale inversely with tank volume (concentrations)
- [ ] Existing temperature scaling still applies
- [ ] Ambient waste unchanged (too small to matter for gas exchange)

## Tests

- Verify waste output is 40% of decay amount
- Verify CO2 increases when food decays
- Verify O2 decreases when food decays
- Verify concentration changes are larger in smaller tanks
- Verify temperature factor still applies to all effects
- Edge cases: zero food, very small amounts, large tank volumes

## Notes

- Creates realistic feedback: overfeeding → decay → CO2↑ O2↓ → fish stress
- Smaller tanks are more sensitive, matching real-world behavior
- Interacts with gas exchange system to find equilibrium
- Interacts with pH system (more CO2 → lower pH via carbonic acid)
