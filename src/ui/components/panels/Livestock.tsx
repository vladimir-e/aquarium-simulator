import React, { useState } from 'react';
import { Panel } from '../layout/Panel';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { FoodResource } from '../../../simulation/resources/index.js';
import type {
  Fish,
  FishSpecies,
  Action,
  Clutch,
  Plant,
  Resources,
} from '../../../simulation/index.js';
import {
  FISH_SPECIES_DATA,
  computeFishVitality,
  classifySatiationBandPosition,
  getMaxFishMass,
  SATIATION_BAND_LABEL,
  type SatiationBand,
} from '../../../simulation/index.js';
import type { LivestockConfig } from '../../../simulation/config/livestock.js';

interface LivestockProps {
  food: number;
  fish: Fish[];
  clutches: Clutch[];
  plants: Plant[];
  resources: Resources;
  tankCapacity: number;
  tick: number;
  livestockConfig: LivestockConfig;
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
 * Text color of the satiation band label, by band. Mirrors the band's
 * gameplay meaning — green for the optimum (well-fed), neutral grey
 * for peckish, amber for caution (hungry / overfed), red for danger
 * (starving). Rendered as plain inline text on the same row as the
 * dot-on-rail progression indicator — no pill background, no rounded
 * box. The disabled-grey of a pill on the "Starving" variant read as
 * broken/inactive instead of dangerous in playtesting; plain coloured
 * text is calmer and clearer.
 */
const SATIATION_LABEL_TEXT_COLOR: Record<SatiationBand, string> = {
  overfed: 'text-orange-400',
  wellFed: 'text-green-400',
  peckish: 'text-gray-400',
  hungry: 'text-yellow-400',
  starving: 'text-red-400',
};

/**
 * Background color of the in-band progression dot, by band. The dot
 * still uses fills (not text colors) since it's a positioned shape on
 * a rail, not a glyph.
 */
const SATIATION_DOT_BG_COLOR: Record<SatiationBand, string> = {
  overfed: 'bg-orange-400',
  wellFed: 'bg-green-400',
  peckish: 'bg-gray-400',
  hungry: 'bg-yellow-400',
  starving: 'bg-red-400',
};

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

/** Threshold below which the trend is considered flat and hidden. */
const TREND_EPSILON = 0.05;

/** All fish species for the dropdown */
const ALL_FISH_SPECIES: FishSpecies[] = [
  'neon_tetra',
  'betta',
  'guppy',
  'angelfish',
  'corydoras',
];

interface FishCardProps {
  fish: Fish;
  resources: Resources;
  plants: Plant[];
  tankCapacity: number;
  livestockConfig: LivestockConfig;
  expanded: boolean;
  onToggleExpanded: () => void;
  onRemove: () => void;
}

function FishCard({
  fish,
  resources,
  plants,
  tankCapacity,
  livestockConfig,
  expanded,
  onToggleExpanded,
  onRemove,
}: FishCardProps): React.JSX.Element {
  const speciesData = FISH_SPECIES_DATA[fish.species];
  const healthColor = getHealthBarColorClass(fish.health);
  const healthStatus = getHealthStatusText(fish.health);
  // Satiation: band label + a single dot inching across a thin rail to
  // show in-band progression. The dot lets the player read "still
  // well-fed but trending toward peckish" without bringing back the
  // fill-it-up bar.
  const satiationPosition = classifySatiationBandPosition(fish.satiation, livestockConfig);
  const satiationLabel = SATIATION_BAND_LABEL[satiationPosition.band];
  const satiationLabelColor = SATIATION_LABEL_TEXT_COLOR[satiationPosition.band];
  const satiationDotColor = SATIATION_DOT_BG_COLOR[satiationPosition.band];

  // The trend arrow tracks the vitality net rate (benefit − damage).
  // Recovery scales with how good conditions are — a tank that's
  // marginal on multiple knobs heals slower than an otherwise-perfect
  // one, and the arrow reflects that. The same vitality result drives
  // the merged Conditions block below — same source of truth as
  // PlantCard.
  const vitality = computeFishVitality(
    fish,
    resources,
    plants,
    resources.water,
    tankCapacity,
    livestockConfig
  );
  const net = vitality.breakdown.net;
  const activeStressors = vitality.breakdown.stressors.filter((s) => s.amount > 0);
  const activeBenefits = vitality.breakdown.benefits.filter((b) => b.amount > 0);
  const totalConditions = activeStressors.length + activeBenefits.length;

  // Fry carry a stage badge and a growth bar (age-driven mass toward
  // adult); adults render neither. Maturity age also anchors the growth %.
  const isFry = fish.stage === 'fry';
  const growthPercent = isFry
    ? Math.min(100, (fish.age / speciesData.breeding.maturityAge) * 100)
    : 100;

  // Reserve bank — breeding fuel and damage buffer. The bar fills toward
  // surplusCap. "Burning reserves": health reads full but the bank is
  // draining to hold it there (net < 0, drained > 0) — a fish that looks
  // fine while spending down its buffer.
  const surplusCap = livestockConfig.surplusCap;
  const reservePercent =
    surplusCap > 0 ? Math.min(100, (fish.surplus / surplusCap) * 100) : 0;
  const burningReserves =
    fish.health >= 100 && net < 0 && vitality.breakdown.drained > 0;

  // Trend arrow — hidden when health is full and net is non-negative
  // (no informational value), or when net is essentially flat. A
  // healthy fish suddenly under attack still shows ↓ at health 100.
  let trendNode: React.ReactNode = null;
  if (Math.abs(net) >= TREND_EPSILON) {
    const showTrend = fish.health < 100 || net < 0;
    if (showTrend) {
      const rising = net > 0;
      const arrow = rising ? '↑' : '↓';
      const colorClass = rising ? 'text-green-400' : 'text-red-400';
      trendNode = (
        <span
          className={`text-xs ${colorClass}`}
          title={`Net health change: ${net >= 0 ? '+' : ''}${net.toFixed(2)}%/hr`}
        >
          {arrow}
        </span>
      );
    }
  }

  const toggleLabel = expanded
    ? `▼ Conditions (${totalConditions})`
    : `▶ Conditions (${totalConditions})`;

  return (
    <div className="flex items-start gap-2 p-2 bg-border/30 rounded">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1 gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm text-gray-200 truncate">{speciesData.name}</span>
            {isFry && (
              <span className="text-[10px] px-1 py-0.5 rounded bg-sky-500/20 text-sky-300 shrink-0">
                Fry
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-gray-500">{formatAge(fish.age)}</span>
            {trendNode}
            <span
              className={`text-xs px-1 py-0.5 rounded ${healthColor} text-black`}
              title={`Health: ${fish.health.toFixed(0)}%`}
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
              style={{ width: `${fish.health}%` }}
            />
          </div>
          <span className="text-xs text-gray-500 w-8 text-right">
            {fish.health.toFixed(0)}%
          </span>
        </div>
        {/* Satiation: in-band dot-on-rail + plain coloured band label.
            No pill background — a bar fights the gameplay goal of
            keeping fish well-fed (not stuffed) and a pill on Starving
            reads as inactive instead of dangerous. The label is plain
            inline text on the same row as the dot. */}
        <div className="flex items-center gap-1 mt-1">
          <span className="text-xs text-gray-500 w-10">Hunger</span>
          <div className="flex-1 relative h-1.5">
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-border" />
            <div
              className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-1.5 w-1.5 rounded-full ${satiationDotColor} transition-all`}
              style={{ left: `${satiationPosition.progress * 100}%` }}
              title={`Satiation: ${fish.satiation.toFixed(0)}%`}
            />
          </div>
          <span
            className={`text-xs ${satiationLabelColor} w-16 text-right`}
            title={`Satiation: ${fish.satiation.toFixed(0)}%`}
          >
            {satiationLabel}
          </span>
        </div>
        {/* Growth — fry only. Age-driven progress toward adult mass;
            adults are always full-grown so the row is dropped. */}
        {isFry && (
          <div className="flex items-center gap-1 mt-1">
            <span className="text-xs text-gray-500 w-10">Growth</span>
            <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
              <div
                className="h-full bg-sky-400 transition-all"
                style={{ width: `${growthPercent}%` }}
              />
            </div>
            <span
              className="text-xs text-gray-500 w-12 text-right"
              title={`${growthPercent.toFixed(0)}% grown toward ${speciesData.adultMass}g adult`}
            >
              {fish.mass.toFixed(2)}g
            </span>
          </div>
        )}
        {/* Reserve bank — breeding fuel + damage buffer, fills toward
            surplusCap. Turns amber while the fish is burning reserves
            (health full, bank draining to hold it there). */}
        <div className="flex items-center gap-1 mt-1">
          <span className="text-xs text-gray-500 w-10">Reserve</span>
          <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${burningReserves ? 'bg-orange-400' : 'bg-sky-500'}`}
              style={{ width: `${reservePercent}%` }}
            />
          </div>
          <span
            className="text-xs text-gray-500 w-12 text-right"
            title={`Reserve: ${fish.surplus.toFixed(1)} / ${surplusCap}`}
          >
            {fish.surplus.toFixed(0)}
          </span>
        </div>
        {burningReserves && (
          <div className="text-xs text-orange-400 mt-0.5">Burning reserves</div>
        )}
        {/* Conditions breakdown — merged stressors (red, +X%) +
            benefits (green, +X%). Mirrors the PlantCard pattern from
            the Plants panel. Hidden when nothing's interesting. */}
        {totalConditions > 0 && (
          <>
            <button
              type="button"
              onClick={onToggleExpanded}
              className="text-xs text-gray-400 hover:text-gray-200 mt-1 w-full text-left"
            >
              {toggleLabel}
            </button>
            {expanded && (
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
        onClick={onRemove}
        className="text-gray-500 hover:text-red-400 p-1 shrink-0"
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
}

/**
 * Egg clutch waiting to hatch — species, egg count, and a hatch
 * countdown in ticks (hours). Inert until `laidTick + hatchTime`; there's
 * nothing for the player to act on, so the card is read-only.
 */
function ClutchCard({ clutch, tick }: { clutch: Clutch; tick: number }): React.JSX.Element {
  const speciesData = FISH_SPECIES_DATA[clutch.species];
  const hatchAt = clutch.laidTick + speciesData.breeding.hatchTime;
  const remaining = Math.max(0, hatchAt - tick);

  return (
    <div className="flex items-center justify-between gap-2 p-2 bg-border/30 rounded">
      <div className="min-w-0">
        <span className="text-sm text-gray-200 truncate">{speciesData.name} clutch</span>
        <div className="text-xs text-gray-500">{clutch.eggCount} eggs</div>
      </div>
      <span
        className="text-xs text-sky-300 shrink-0"
        title={`Laid at tick ${clutch.laidTick}, hatches at tick ${hatchAt}`}
      >
        {remaining > 0 ? `hatches in ${remaining}h` : 'hatching…'}
      </span>
    </div>
  );
}

export function Livestock({
  food,
  fish,
  clutches,
  plants,
  resources,
  tankCapacity,
  tick,
  livestockConfig,
  executeAction,
}: LivestockProps): React.JSX.Element {
  const [selectedSpecies, setSelectedSpecies] = useState<FishSpecies>('neon_tetra');
  const [expandedFishIds, setExpandedFishIds] = useState<Set<string>>(new Set());

  const opacity = getFoodIndicatorOpacity(food);
  const indicatorClass = food === 0 ? 'bg-border' : 'bg-orange-500';

  const fryCount = fish.reduce((n, f) => n + (f.stage === 'fry' ? 1 : 0), 0);

  // Physical stocking ceiling — mirrors the Plants panel's capacity gate.
  // Total current fish mass plus one more adult of the selected species
  // must fit under the tank's volume-derived limit.
  const maxFishMass = getMaxFishMass(tankCapacity);
  const currentFishMass = fish.reduce((sum, f) => sum + f.mass, 0);
  const canAddSelected =
    currentFishMass + FISH_SPECIES_DATA[selectedSpecies].adultMass <= maxFishMass;

  const handleAddFish = (): void => {
    executeAction({ type: 'addFish', species: selectedSpecies });
  };

  const handleRemoveFish = (fishId: string): void => {
    executeAction({ type: 'removeFish', fishId });
  };

  const handleSellFry = (): void => {
    executeAction({ type: 'sellFry' });
  };

  const handleSpeciesChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    setSelectedSpecies(e.target.value as FishSpecies);
  };

  const toggleExpanded = (fishId: string): void => {
    setExpandedFishIds((prev) => {
      const next = new Set(prev);
      if (next.has(fishId)) {
        next.delete(fishId);
      } else {
        next.add(fishId);
      }
      return next;
    });
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
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-gray-400 font-medium">
                Fish ({fish.length})
              </span>
              {fryCount > 0 && (
                <button
                  type="button"
                  onClick={handleSellFry}
                  className="text-xs text-gray-400 hover:text-gray-100"
                  title="Remove every fry from the tank"
                >
                  Sell fry ({fryCount})
                </button>
              )}
            </div>
            {fish.map((f) => (
              <FishCard
                key={f.id}
                fish={f}
                resources={resources}
                plants={plants}
                tankCapacity={tankCapacity}
                livestockConfig={livestockConfig}
                expanded={expandedFishIds.has(f.id)}
                onToggleExpanded={() => toggleExpanded(f.id)}
                onRemove={() => handleRemoveFish(f.id)}
              />
            ))}
          </div>
        ) : (
          <div className="text-xs text-gray-400 italic">No fish yet...</div>
        )}

        {/* Clutches — eggs in the water waiting to hatch. Egg-laying
            spawns deposit these; livebearers never do. */}
        {clutches.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs text-gray-400 font-medium">
              Clutches ({clutches.length})
            </div>
            {clutches.map((clutch) => (
              <ClutchCard key={clutch.id} clutch={clutch} tick={tick} />
            ))}
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
              disabled={!canAddSelected}
              variant="primary"
            >
              Add
            </Button>
          </div>
          {!canAddSelected && (
            <div className="text-xs text-yellow-400 mt-1">
              Tank at fish capacity (~{Math.floor(maxFishMass)}g of fish max)
            </div>
          )}
          {/* Species info */}
          <div className="text-xs text-gray-500 mt-2">
            <span className="text-gray-400">{selectedData.name}:</span>{' '}
            {selectedData.adultMass}g, {selectedData.temperatureRange[0]}-
            {selectedData.temperatureRange[1]}°C, pH {selectedData.phRange[0]}-
            {selectedData.phRange[1]}, hardiness:{' '}
            {selectedData.hardiness >= 0.7
              ? 'high'
              : selectedData.hardiness >= 0.5
                ? 'medium'
                : 'low'}
          </div>
        </div>
      </div>
    </Panel>
  );
}
