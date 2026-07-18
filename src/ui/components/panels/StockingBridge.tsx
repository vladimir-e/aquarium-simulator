import React, { useState } from 'react';
import { Panel } from '../layout/Panel';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import type { Action, FishSpecies, PlantSpecies, SimulationState } from '../../../simulation/index.js';
import {
  FISH_SPECIES_DATA,
  PLANT_SPECIES_DATA,
  checkFishCapacity,
  getMaxPlants,
  isSubstrateCompatible,
} from '../../../simulation/index.js';

const FISH_SPECIES: FishSpecies[] = ['neon_tetra', 'betta', 'guppy', 'angelfish', 'corydoras'];
const PLANT_SPECIES: PlantSpecies[] = [
  'java_fern',
  'anubias',
  'amazon_sword',
  'dwarf_hairgrass',
  'monte_carlo',
];

interface StockingBridgeProps {
  state: SimulationState;
  executeAction: (action: Action) => void;
}

/**
 * Minimal add-fish / add-plant controls. A bridge so stocking stays reachable
 * until Unit 3 builds the real Stocking column; reuses the engine's capacity
 * and substrate gates.
 */
export function StockingBridge({ state, executeAction }: StockingBridgeProps): React.JSX.Element {
  const [fishSpecies, setFishSpecies] = useState<FishSpecies>('neon_tetra');
  const [plantSpecies, setPlantSpecies] = useState<PlantSpecies>('java_fern');

  const substrate = state.equipment.substrate.type;
  const fishCapacity = checkFishCapacity(state.fish, state.tank.capacity, fishSpecies);
  const maxPlants = getMaxPlants(state.tank.capacity);
  const atPlantCapacity = state.plants.length >= maxPlants;
  const plantCompatible = isSubstrateCompatible(plantSpecies, substrate);

  return (
    <Panel title="Stocking">
      <div className="space-y-4">
        <div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Select
                label="Fish"
                value={fishSpecies}
                onChange={(e) => setFishSpecies(e.target.value as FishSpecies)}
              >
                {FISH_SPECIES.map((species) => (
                  <option key={species} value={species}>
                    {FISH_SPECIES_DATA[species].name}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              onClick={() => executeAction({ type: 'addFish', species: fishSpecies })}
              disabled={!fishCapacity.ok}
              variant="primary"
            >
              Add
            </Button>
          </div>
          {!fishCapacity.ok && (
            <div className="text-xs text-yellow-400 mt-1">{fishCapacity.message}</div>
          )}
        </div>

        <div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Select
                label="Plant"
                value={plantSpecies}
                onChange={(e) => setPlantSpecies(e.target.value as PlantSpecies)}
              >
                {PLANT_SPECIES.map((species) => {
                  const compatible = isSubstrateCompatible(species, substrate);
                  return (
                    <option key={species} value={species} disabled={!compatible}>
                      {PLANT_SPECIES_DATA[species].name}
                      {compatible ? '' : ' (incompatible)'}
                    </option>
                  );
                })}
              </Select>
            </div>
            <Button
              onClick={() => executeAction({ type: 'addPlant', species: plantSpecies })}
              disabled={!plantCompatible || atPlantCapacity}
              variant="primary"
            >
              Add
            </Button>
          </div>
          {atPlantCapacity && (
            <div className="text-xs text-yellow-400 mt-1">
              Tank at plant capacity ({maxPlants} max)
            </div>
          )}
          {!atPlantCapacity && !plantCompatible && (
            <div className="text-xs text-yellow-400 mt-1">
              {PLANT_SPECIES_DATA[plantSpecies].name} needs a compatible substrate
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
