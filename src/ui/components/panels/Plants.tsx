import React, { useState } from 'react';
import { Panel } from '../layout/Panel';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { AlgaeResource } from '../../../simulation/resources/index.js';
import type {
  Plant,
  PlantSpecies,
  Resources,
  SubstrateType,
  Action,
  VitalityResult,
} from '../../../simulation/index.js';
import {
  PLANT_SPECIES_DATA,
  isSubstrateCompatible,
  getMaxPlants,
  computePlantVitality,
  calculateNutrientSufficiency,
} from '../../../simulation/index.js';
import type { PlantsConfig } from '../../../simulation/config/plants.js';
import type { NutrientsConfig } from '../../../simulation/config/nutrients.js';

interface PlantsProps {
  algae: number;
  plants: Plant[];
  resources: Resources;
  tankCapacity: number;
  substrateType: SubstrateType;
  plantsConfig: PlantsConfig;
  nutrientsConfig: NutrientsConfig;
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

/** Threshold below which the trend is considered flat and hidden. */
const TREND_EPSILON = 0.05;

/** All plant species for the dropdown */
const ALL_SPECIES: PlantSpecies[] = [
  'java_fern',
  'anubias',
  'amazon_sword',
  'dwarf_hairgrass',
  'monte_carlo',
];

/** Minimum trim floor — prevents nuking a plant to zero. */
const MIN_TRIM_SIZE = 20;

/**
 * Default slider position when opening the trim control: ~30 % off, floored to MIN_TRIM_SIZE.
 */
function defaultTrimTarget(size: number): number {
  return Math.max(MIN_TRIM_SIZE, Math.floor(size * 0.7));
}

interface PlantCardProps {
  plant: Plant;
  vitality: VitalityResult;
  trimExpanded: boolean;
  trimValue: number;
  onOpenTrim: (id: string, size: number) => void;
  onTrimSliderChange: (value: string) => void;
  onTrimConfirm: (id: string, size: number) => void;
  onTrimCancel: () => void;
  onRemove: (id: string) => void;
  conditionsExpanded: boolean;
  onToggleConditions: () => void;
}

function PlantCard({
  plant,
  vitality,
  trimExpanded,
  trimValue,
  onOpenTrim,
  onTrimSliderChange,
  onTrimConfirm,
  onTrimCancel,
  onRemove,
  conditionsExpanded,
  onToggleConditions,
}: PlantCardProps): React.JSX.Element {
  const speciesData = PLANT_SPECIES_DATA[plant.species];
  const sizePercent = Math.min(plant.size, 200);
  const sizeBarWidth = (sizePercent / 200) * 100;
  const sizeColorClass = getSizeBarColorClass(plant.size);
  const sizeStatus = getSizeStatus(plant.size);
  const condition = plant.condition;
  const conditionBarWidth = condition;
  const conditionColorClass = getConditionBarColorClass(condition);
  const conditionStatus = getConditionStatusText(condition);
  const canTrimThis = plant.size > MIN_TRIM_SIZE;
  const sliderMax = Math.max(MIN_TRIM_SIZE, Math.floor(plant.size));
  const sliderValue = trimExpanded ? trimValue : defaultTrimTarget(plant.size);
  const removed = Math.max(0, plant.size - sliderValue);

  const activeStressors = vitality.breakdown.stressors.filter((s) => s.amount > 0);
  const activeBenefits = vitality.breakdown.benefits.filter((b) => b.amount > 0);
  const totalConditions = activeStressors.length + activeBenefits.length;
  const net = vitality.breakdown.net;

  // Trend arrow — hidden when condition is full and net is non-negative
  // (no informational value), or when net is essentially flat.
  let trendNode: React.ReactNode = null;
  if (Math.abs(net) >= TREND_EPSILON) {
    const showTrend = condition < 100 || net < 0;
    if (showTrend) {
      const rising = net > 0;
      const arrow = rising ? '↑' : '↓';
      const colorClass = rising ? 'text-green-400' : 'text-red-400';
      trendNode = (
        <span
          className={`text-xs ${colorClass}`}
          title={`Net condition change: ${net >= 0 ? '+' : ''}${net.toFixed(2)}%/hr`}
        >
          {arrow}
        </span>
      );
    }
  }

  const toggleLabel = conditionsExpanded
    ? `▼ Conditions (${totalConditions})`
    : `▶ Conditions (${totalConditions})`;

  return (
    <div className="p-2 bg-border/30 rounded">
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-gray-200 truncate">
              {speciesData.name}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">
                {plant.size.toFixed(0)}%
              </span>
              {trendNode}
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
          {/* Conditions breakdown — merged stressors (red, +X%) +
              benefits (green, +X%). Mirrors the FishCard pattern from
              the same panel layer. Hidden when nothing's interesting. */}
          {totalConditions > 0 && (
            <>
              <button
                type="button"
                onClick={onToggleConditions}
                className="text-xs text-gray-400 hover:text-gray-200 mt-1 w-full text-left"
              >
                {toggleLabel}
              </button>
              {conditionsExpanded && (
                <div className="text-xs mt-1 space-y-0.5 pl-2">
                  {activeStressors.map((s) => (
                    <div key={`s-${s.key}`} className="flex justify-between text-red-400">
                      <span>{s.label}</span>
                      <span>+{s.amount.toFixed(2)}%/h</span>
                    </div>
                  ))}
                  {activeBenefits.map((b) => (
                    <div key={`b-${b.key}`} className="flex justify-between text-green-400">
                      <span>{b.label}</span>
                      <span>+{b.amount.toFixed(2)}%/h</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <button
          onClick={() => (trimExpanded ? onTrimCancel() : onOpenTrim(plant.id, plant.size))}
          className={`p-1 ${canTrimThis ? 'text-gray-500 hover:text-green-400' : 'text-gray-700 cursor-not-allowed'}`}
          title={canTrimThis ? 'Trim plant' : `Plant is at or below ${MIN_TRIM_SIZE}%`}
          disabled={!canTrimThis}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path d="M5.5 3a2.5 2.5 0 011.885 4.141L10 9.75l6.464-6.464a.75.75 0 011.061 1.06L11.06 10.81l2.625 2.614a2.5 2.5 0 11-1.06 1.06L10 11.87l-2.625 2.614a2.5 2.5 0 11-1.06-1.06L8.94 10.81 6.293 8.163A2.5 2.5 0 115.5 3zm0 1.5a1 1 0 100 2 1 1 0 000-2zm0 9a1 1 0 100 2 1 1 0 000-2zm9 0a1 1 0 100 2 1 1 0 000-2z" />
          </svg>
        </button>
        <button
          onClick={() => onRemove(plant.id)}
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
      {trimExpanded && canTrimThis && (
        <div className="mt-2 pt-2 border-t border-border/50 space-y-2">
          <input
            type="range"
            min={MIN_TRIM_SIZE}
            max={sliderMax}
            step={1}
            value={sliderValue}
            onChange={(e) => onTrimSliderChange(e.target.value)}
            className="w-full"
          />
          <div className="text-xs text-gray-300">
            Trim to <span className="font-medium text-gray-100">{sliderValue}%</span>{' '}
            <span className="text-gray-500">·</span>{' '}
            removes <span className="font-medium text-gray-100">{removed.toFixed(0)}%</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => onTrimConfirm(plant.id, sliderValue)}
              variant="primary"
            >
              Trim
            </Button>
            <button
              type="button"
              onClick={onTrimCancel}
              className="text-xs text-gray-400 hover:text-gray-200"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Plants({
  algae,
  plants,
  resources,
  tankCapacity,
  substrateType,
  plantsConfig,
  nutrientsConfig,
  executeAction,
}: PlantsProps): React.JSX.Element {
  const [selectedSpecies, setSelectedSpecies] = useState<PlantSpecies>('java_fern');
  const [trim, setTrim] = useState<{ plantId: string; value: number } | null>(null);
  const [expandedConditionsIds, setExpandedConditionsIds] = useState<Set<string>>(new Set());

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

  const handleOpenTrim = (plantId: string, size: number): void => {
    setTrim({ plantId, value: defaultTrimTarget(size) });
  };

  const handleTrimSliderChange = (value: string): void => {
    const next = parseInt(value, 10);
    setTrim((prev) => (prev ? { ...prev, value: next } : prev));
  };

  const handleTrimConfirm = (plantId: string, targetSize: number): void => {
    executeAction({ type: 'trimPlants', plantId, targetSize });
    setTrim(null);
  };

  const handleTrimCancel = (): void => {
    setTrim(null);
  };

  const handleSpeciesChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    setSelectedSpecies(e.target.value as PlantSpecies);
  };

  const toggleConditions = (plantId: string): void => {
    setExpandedConditionsIds((prev) => {
      const next = new Set(prev);
      if (next.has(plantId)) {
        next.delete(plantId);
      } else {
        next.add(plantId);
      }
      return next;
    });
  };

  const canAddSelectedSpecies =
    isSubstrateCompatible(selectedSpecies, substrateType) && !isAtCapacity;

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
              const nutrientSufficiency = calculateNutrientSufficiency(
                resources,
                resources.water,
                plant.species,
                nutrientsConfig
              );
              const vitality = computePlantVitality({
                plant,
                resources,
                waterVolume: resources.water,
                plantsConfig,
                nutrientSufficiency,
              });
              const trimExpanded = trim?.plantId === plant.id;
              const trimValue = trim?.value ?? defaultTrimTarget(plant.size);
              return (
                <PlantCard
                  key={plant.id}
                  plant={plant}
                  vitality={vitality}
                  trimExpanded={trimExpanded}
                  trimValue={trimValue}
                  onOpenTrim={handleOpenTrim}
                  onTrimSliderChange={handleTrimSliderChange}
                  onTrimConfirm={handleTrimConfirm}
                  onTrimCancel={handleTrimCancel}
                  onRemove={handleRemovePlant}
                  conditionsExpanded={expandedConditionsIds.has(plant.id)}
                  onToggleConditions={() => toggleConditions(plant.id)}
                />
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
