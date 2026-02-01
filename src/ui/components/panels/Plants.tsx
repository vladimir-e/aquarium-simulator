import React, { useState } from 'react';
import { Panel } from '../layout/Panel';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { AlgaeResource } from '../../../simulation/resources/index.js';
import type { Plant, PlantSpecies, SubstrateType, Action } from '../../../simulation/index.js';
import { PLANT_SPECIES_DATA, isSubstrateCompatible, getMaxPlants } from '../../../simulation/index.js';

interface PlantsProps {
  algae: number;
  plants: Plant[];
  tankCapacity: number;
  substrateType: SubstrateType;
  executeAction: (action: Action) => void;
}

/**
 * Get opacity for algae indicator based on algae level.
 * 0 = 0.3 (dim), 100 = 1.0 (bright bloom)
 */
function getAlgaeIndicatorOpacity(algae: number): number {
  if (algae === 0) return 0.3;
  const intensity = Math.min(algae / 100, 1.0);
  return 0.3 + intensity * 0.7; // 0.3 to 1.0
}

/**
 * Get algae description based on level.
 */
function getAlgaeDescription(algae: number): string {
  if (algae < 5) return 'Clean';
  if (algae < 30) return 'Trace';
  if (algae < 50) return 'Visible';
  if (algae < 80) return 'High';
  return 'Bloom!';
}

/**
 * Get color class for size bar based on plant size.
 * 0-100: green, 100-200: yellow, >200: red
 */
function getSizeBarColorClass(size: number): string {
  if (size <= 100) return 'bg-green-500';
  if (size <= 200) return 'bg-yellow-500';
  return 'bg-red-500';
}

/**
 * Get size status text for a plant.
 */
function getSizeStatus(size: number): string {
  if (size <= 100) return '';
  if (size <= 200) return 'Overgrown';
  return 'Critically overgrown!';
}

/**
 * Get color class for condition bar based on plant condition.
 * 0-30: red (dying), 30-60: yellow (struggling), 60-100: green (healthy)
 */
function getConditionBarColorClass(condition: number): string {
  if (condition < 30) return 'bg-red-500';
  if (condition < 60) return 'bg-yellow-500';
  return 'bg-green-500';
}

/**
 * Get condition status text for a plant.
 */
function getConditionStatusText(condition: number): string {
  if (condition < 10) return 'Dying';
  if (condition < 30) return 'Struggling';
  if (condition < 60) return 'Fair';
  if (condition < 80) return 'Good';
  return 'Thriving';
}

/** All plant species for the dropdown */
const ALL_SPECIES: PlantSpecies[] = [
  'java_fern',
  'anubias',
  'amazon_sword',
  'dwarf_hairgrass',
  'monte_carlo',
];

export function Plants({
  algae,
  plants,
  tankCapacity,
  substrateType,
  executeAction,
}: PlantsProps): React.JSX.Element {
  const [selectedSpecies, setSelectedSpecies] = useState<PlantSpecies>('java_fern');

  const opacity = getAlgaeIndicatorOpacity(algae);
  const indicatorClass = algae === 0 ? 'bg-border' : 'bg-green-500';
  const description = getAlgaeDescription(algae);

  const maxPlants = getMaxPlants(tankCapacity);
  const isAtCapacity = plants.length >= maxPlants;

  const handleAddPlant = (): void => {
    executeAction({ type: 'addPlant', species: selectedSpecies });
  };

  const handleRemovePlant = (plantId: string): void => {
    executeAction({ type: 'removePlant', plantId });
  };

  const handleSpeciesChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    setSelectedSpecies(e.target.value as PlantSpecies);
  };

  const canAddSelectedSpecies = isSubstrateCompatible(selectedSpecies, substrateType) && !isAtCapacity;

  return (
    <Panel title="Plants">
      <div className="space-y-4">
        {/* Algae indicator */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-300">Algae</span>
          <div className="flex items-center gap-2">
            <div
              className={`w-3 h-3 rounded-full ${indicatorClass}`}
              style={{ opacity }}
              title={`${AlgaeResource.format(algae)} algae level`}
            />
            <span className="text-xs text-gray-400">
              {AlgaeResource.format(algae)} ({description})
            </span>
          </div>
        </div>

        {/* Plants list */}
        {plants.length > 0 ? (
          <div className="space-y-2">
            <div className="text-xs text-gray-400 font-medium">
              Plants ({plants.length}/{maxPlants})
            </div>
            {plants.map((plant) => {
              const speciesData = PLANT_SPECIES_DATA[plant.species];
              const sizePercent = Math.min(plant.size, 200);
              const sizeBarWidth = (sizePercent / 200) * 100;
              const sizeColorClass = getSizeBarColorClass(plant.size);
              const sizeStatus = getSizeStatus(plant.size);
              const condition = plant.condition ?? 100;
              const conditionBarWidth = condition;
              const conditionColorClass = getConditionBarColorClass(condition);
              const conditionStatus = getConditionStatusText(condition);

              return (
                <div
                  key={plant.id}
                  className="flex items-center gap-2 p-2 bg-border/30 rounded"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-200 truncate">
                        {speciesData.name}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">
                          {plant.size.toFixed(0)}%
                        </span>
                        <span
                          className={`text-xs px-1 py-0.5 rounded ${conditionColorClass} text-black`}
                          title={`Condition: ${condition.toFixed(0)}%`}
                        >
                          {conditionStatus}
                        </span>
                      </div>
                    </div>
                    {/* Size bar */}
                    <div className="flex items-center gap-1 mb-1">
                      <span className="text-xs text-gray-500 w-8">Size</span>
                      <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                        <div
                          className={`h-full ${sizeColorClass} transition-all`}
                          style={{ width: `${sizeBarWidth}%` }}
                        />
                      </div>
                    </div>
                    {/* Condition bar */}
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-500 w-8">Cond</span>
                      <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                        <div
                          className={`h-full ${conditionColorClass} transition-all`}
                          style={{ width: `${conditionBarWidth}%` }}
                        />
                      </div>
                    </div>
                    {sizeStatus && (
                      <div className="text-xs text-yellow-400 mt-0.5">{sizeStatus}</div>
                    )}
                    {condition < 30 && (
                      <div className="text-xs text-red-400 mt-0.5">
                        Nutrient deficiency!
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleRemovePlant(plant.id)}
                    className="text-gray-500 hover:text-red-400 p-1"
                    title="Remove plant"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-xs text-gray-400 italic">
            No plants yet... (0/{maxPlants} capacity)
          </div>
        )}

        {/* Add plant controls */}
        <div className="pt-2 border-t border-border">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Select
                label="Species"
                value={selectedSpecies}
                onChange={handleSpeciesChange}
              >
                {ALL_SPECIES.map((species) => {
                  const data = PLANT_SPECIES_DATA[species];
                  const compatible = isSubstrateCompatible(species, substrateType);
                  return (
                    <option key={species} value={species} disabled={!compatible}>
                      {data.name}
                      {!compatible ? ' (incompatible)' : ''}
                    </option>
                  );
                })}
              </Select>
            </div>
            <Button
              onClick={handleAddPlant}
              disabled={!canAddSelectedSpecies}
              variant="primary"
            >
              Add
            </Button>
          </div>
          {isAtCapacity && (
            <div className="text-xs text-yellow-400 mt-1">
              Tank at plant capacity ({maxPlants} max)
            </div>
          )}
          {!isAtCapacity && !isSubstrateCompatible(selectedSpecies, substrateType) && (
            <div className="text-xs text-yellow-400 mt-1">
              {PLANT_SPECIES_DATA[selectedSpecies].name} requires{' '}
              {PLANT_SPECIES_DATA[selectedSpecies].substrateRequirement === 'aqua_soil'
                ? 'aqua soil'
                : 'sand or aqua soil'}{' '}
              substrate
            </div>
          )}
          {/* Species info */}
          <div className="text-xs text-gray-500 mt-2">
            <span className="text-gray-400">
              {PLANT_SPECIES_DATA[selectedSpecies].name}:
            </span>{' '}
            {PLANT_SPECIES_DATA[selectedSpecies].lightRequirement} light,{' '}
            {PLANT_SPECIES_DATA[selectedSpecies].co2Requirement} CO2
          </div>
        </div>
      </div>
    </Panel>
  );
}
