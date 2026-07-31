import React from 'react';
import { Plus } from 'lucide-react';
import { getHardscapeName, getHardscapeSurface, getMaxPlants } from '../../../simulation/index.js';
import { SurfaceResource } from '../../../simulation/resources/index.js';
import type { useSimulation } from '../../hooks/useSimulation';
import { HARDSCAPE_TYPES, plantOptions } from '../../build';
import { SplitButton, type SplitOption } from '../run/SplitButton';

type Sim = ReturnType<typeof useSimulation>;

/** Construction verbs: the stage header on a wide host, the list's last row on a phone. */
export function AddPlant({ sim, opens }: { sim: Sim; opens: 'up' | 'down' }): React.JSX.Element {
  const { plants, tank, equipment } = sim.state;
  const full = plants.length >= getMaxPlants(tank.capacity);

  const options: SplitOption[] = plantOptions(equipment.substrate.type).map((option) => ({
    key: option.species,
    label: option.name,
    hint: option.hint,
    disabled: !option.compatible,
    onSelect: () => sim.executeAction({ type: 'addPlant', species: option.species }),
  }));

  return (
    <SplitButton
      label={
        <span className="flex items-center gap-1">
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add plant
        </span>
      }
      options={options}
      disabled={full}
      opens={opens}
      ariaLabel={full ? 'Add plant — tank at plant capacity' : 'Add plant'}
    />
  );
}

export function AddHardscape({ sim, opens }: { sim: Sim; opens: 'up' | 'down' }): React.JSX.Element {
  const { equipment, tank } = sim.state;
  const full = equipment.hardscape.items.length >= tank.hardscapeSlots;

  const options: SplitOption[] = HARDSCAPE_TYPES.map((type) => ({
    key: type,
    label: getHardscapeName(type),
    hint: SurfaceResource.format(getHardscapeSurface(type)),
    onSelect: () => sim.addHardscapeItem(type),
  }));

  return (
    <SplitButton
      label={
        <span className="flex items-center gap-1">
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Hardscape
        </span>
      }
      options={options}
      disabled={full}
      opens={opens}
      ariaLabel={full ? 'Add hardscape — every slot filled' : 'Add hardscape'}
    />
  );
}
