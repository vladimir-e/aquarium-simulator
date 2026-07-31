import React from 'react';
import { Plus } from 'lucide-react';
import type { useSimulation } from '../../hooks/useSimulation';
import { useUnits } from '../../hooks/useUnits';
import { fishOptions } from '../../build';
import { SplitButton, type SplitOption } from '../run/SplitButton';

/**
 * The section's construction verb. There is no sex picker because `addFish`
 * takes no sex — `createFish` samples it — so the menu says so rather than
 * offering a control that would do nothing.
 */
export function AddFish({
  sim,
  opens,
}: {
  sim: ReturnType<typeof useSimulation>;
  opens: 'up' | 'down';
}): React.JSX.Element {
  const { unitSystem } = useUnits();
  const { fish, tank } = sim.state;
  const candidates = fishOptions(fish, tank.capacity, unitSystem);

  const options: SplitOption[] = candidates.map((option) => ({
    key: option.species,
    label: option.name,
    hint: option.hint,
    facts: option.facts,
    disabled: option.disabled,
    onSelect: () => sim.executeAction({ type: 'addFish', species: option.species }),
  }));

  return (
    <SplitButton
      label={
        <span className="flex items-center gap-1">
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add fish
        </span>
      }
      options={options}
      opens={opens}
      ariaLabel="Add fish"
      note="Sex is random — sampled when the fish is created, the same as for fry. Hardiness is the share of stress a species shrugs off: damage lands at (1 − hardiness), so 0.8 takes a fifth of the hit."
    />
  );
}
