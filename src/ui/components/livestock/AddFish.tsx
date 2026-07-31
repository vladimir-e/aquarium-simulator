import React from 'react';
import { Plus } from 'lucide-react';
import type { useSimulation } from '../../hooks/useSimulation';
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
  const { fish, tank } = sim.state;
  const candidates = fishOptions(fish, tank.capacity);

  const options: SplitOption[] = candidates.map((option) => ({
    key: option.species,
    label: option.name,
    hint: option.hint,
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
      note="Sex is random — sampled when the fish is created, the same as for fry."
    />
  );
}
