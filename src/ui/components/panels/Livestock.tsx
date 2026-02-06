import React, { useState } from 'react';
import { Panel } from '../layout/Panel';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { FoodResource } from '../../../simulation/resources/index.js';
import type { Fish, FishSpecies, Action } from '../../../simulation/index.js';
import { FISH_SPECIES_DATA } from '../../../simulation/index.js';

interface LivestockProps {
  food: number;
  fish: Fish[];
  executeAction: (action: Action) => void;
}

/**
 * Get opacity for food indicator based on food amount.
 * 0g = 0.3 (dim), 2g+ = 1.0 (bright)
 */
function getFoodIndicatorOpacity(food: number): number {
  if (food === 0) return 0.3;
  const intensity = Math.min(food / 2.0, 1.0);
  return 0.3 + intensity * 0.7;
}

/**
 * Get color class for health bar.
 */
function getHealthBarColorClass(health: number): string {
  if (health < 30) return 'bg-red-500';
  if (health < 70) return 'bg-yellow-500';
  return 'bg-green-500';
}

/**
 * Get health status text.
 */
function getHealthStatusText(health: number): string {
  if (health < 10) return 'Critical';
  if (health < 30) return 'Sick';
  if (health < 70) return 'Stressed';
  if (health < 90) return 'Good';
  return 'Healthy';
}

/**
 * Get color class for hunger bar.
 * Low hunger = green (well-fed), high hunger = red (starving)
 */
function getHungerBarColorClass(hunger: number): string {
  if (hunger > 70) return 'bg-red-500';
  if (hunger > 50) return 'bg-yellow-500';
  return 'bg-green-500';
}

/**
 * Get hunger status text.
 */
function getHungerStatusText(hunger: number): string {
  if (hunger < 10) return 'Full';
  if (hunger < 30) return 'Satisfied';
  if (hunger < 50) return 'Peckish';
  if (hunger < 70) return 'Hungry';
  return 'Starving';
}

/**
 * Format fish age from ticks (hours) to a readable string.
 */
function formatAge(ageTicks: number): string {
  const hours = ageTicks;
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 365) return `${days}d`;
  const years = (days / 365).toFixed(1);
  return `${years}y`;
}

/** All fish species for the dropdown */
const ALL_FISH_SPECIES: FishSpecies[] = [
  'neon_tetra',
  'betta',
  'guppy',
  'angelfish',
  'corydoras',
];

export function Livestock({
  food,
  fish,
  executeAction,
}: LivestockProps): React.JSX.Element {
  const [selectedSpecies, setSelectedSpecies] = useState<FishSpecies>('neon_tetra');

  const opacity = getFoodIndicatorOpacity(food);
  const indicatorClass = food === 0 ? 'bg-border' : 'bg-orange-500';

  const handleAddFish = (): void => {
    executeAction({ type: 'addFish', species: selectedSpecies });
  };

  const handleRemoveFish = (fishId: string): void => {
    executeAction({ type: 'removeFish', fishId });
  };

  const handleSpeciesChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    setSelectedSpecies(e.target.value as FishSpecies);
  };

  const selectedData = FISH_SPECIES_DATA[selectedSpecies];

  return (
    <Panel title="Livestock">
      <div className="space-y-4">
        {/* Food indicator */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-300">Food available</span>
          <div className="flex items-center gap-2">
            <div
              className={`w-3 h-3 rounded-full ${indicatorClass}`}
              style={{ opacity }}
              title={`${FoodResource.format(food)} food`}
            />
            <span className="text-xs text-gray-400">{FoodResource.format(food)}</span>
          </div>
        </div>

        {/* Fish list */}
        {fish.length > 0 ? (
          <div className="space-y-2">
            <div className="text-xs text-gray-400 font-medium">
              Fish ({fish.length})
            </div>
            {fish.map((f) => {
              const speciesData = FISH_SPECIES_DATA[f.species];
              const healthColor = getHealthBarColorClass(f.health);
              const healthStatus = getHealthStatusText(f.health);
              const hungerColor = getHungerBarColorClass(f.hunger);
              const hungerStatus = getHungerStatusText(f.hunger);

              return (
                <div
                  key={f.id}
                  className="flex items-center gap-2 p-2 bg-border/30 rounded"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-200 truncate">
                        {speciesData.name}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">
                          {formatAge(f.age)}
                        </span>
                        <span
                          className={`text-xs px-1 py-0.5 rounded ${healthColor} text-black`}
                          title={`Health: ${f.health.toFixed(0)}%`}
                        >
                          {healthStatus}
                        </span>
                      </div>
                    </div>
                    {/* Health bar */}
                    <div className="flex items-center gap-1 mb-1">
                      <span className="text-xs text-gray-500 w-10">Health</span>
                      <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                        <div
                          className={`h-full ${healthColor} transition-all`}
                          style={{ width: `${f.health}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 w-8 text-right">
                        {f.health.toFixed(0)}%
                      </span>
                    </div>
                    {/* Hunger bar */}
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-500 w-10">Hunger</span>
                      <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                        <div
                          className={`h-full ${hungerColor} transition-all`}
                          style={{ width: `${f.hunger}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 w-8 text-right">
                        {hungerStatus}
                      </span>
                    </div>
                    {/* Warnings */}
                    {f.hunger > 70 && (
                      <div className="text-xs text-red-400 mt-0.5">Starving!</div>
                    )}
                    {f.health < 30 && (
                      <div className="text-xs text-red-400 mt-0.5">
                        Health critical!
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleRemoveFish(f.id)}
                    className="text-gray-500 hover:text-red-400 p-1"
                    title="Remove fish"
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
            No fish yet...
          </div>
        )}

        {/* Add fish controls */}
        <div className="pt-2 border-t border-border">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Select
                label="Species"
                value={selectedSpecies}
                onChange={handleSpeciesChange}
              >
                {ALL_FISH_SPECIES.map((species) => {
                  const data = FISH_SPECIES_DATA[species];
                  return (
                    <option key={species} value={species}>
                      {data.name}
                    </option>
                  );
                })}
              </Select>
            </div>
            <Button
              onClick={handleAddFish}
              variant="primary"
            >
              Add
            </Button>
          </div>
          {/* Species info */}
          <div className="text-xs text-gray-500 mt-2">
            <span className="text-gray-400">
              {selectedData.name}:
            </span>{' '}
            {selectedData.adultMass}g, {selectedData.temperatureRange[0]}-{selectedData.temperatureRange[1]}°C,
            pH {selectedData.phRange[0]}-{selectedData.phRange[1]},
            hardiness: {selectedData.hardiness >= 0.7 ? 'high' : selectedData.hardiness >= 0.5 ? 'medium' : 'low'}
          </div>
        </div>
      </div>
    </Panel>
  );
}
