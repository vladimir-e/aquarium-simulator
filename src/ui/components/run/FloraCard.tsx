import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { Action, Plant, SimulationState, VitalityResult } from '../../../simulation/index.js';
import {
  PLANT_SPECIES_DATA,
  computeAlgaePopulation,
  computePlantVitality,
  calculateNutrientSufficiency,
  canTrimPlants,
  getMaxPlants,
  MIN_ALGAE_TO_SCRUB,
} from '../../../simulation/index.js';
import { SurfaceResource } from '../../../simulation/resources/index.js';
import type { TunableConfig } from '../../../simulation/config/index.js';
import {
  algaeStatus,
  algaeWord,
  allNutrientsDepleted,
  conditionStatus,
  conditionWord,
  dosePresets,
  type NutrientState,
  nutrientReadings,
  scapeSummary,
  trimTargets,
} from '../../run';
import { Card, CardBody, CardFooter, CardHeader } from './Card';
import { Bar, Caret, Pill, RunButton, statusText } from './elements';
import { SplitButton, type SplitOption } from './SplitButton';

const TREND_EPSILON = 0.05;

const NUTRIENT_CHIP: Record<NutrientState, string> = {
  depleted: 'border-warn/50 text-warn-text',
  low: 'border-warn/50 text-warn-text',
  ok: 'border-hairline text-ink-2',
  high: 'border-warn/50 text-warn-text',
  veryHigh: 'border-alert/50 text-alert-text',
};

function Breakdown({
  stressors,
  benefits,
  invert = false,
}: {
  stressors: VitalityResult['breakdown']['stressors'];
  benefits: VitalityResult['breakdown']['benefits'];
  invert?: boolean;
}): React.JSX.Element {
  // For algae the sentiment inverts: a stressor is good news (algae losing).
  const stressColor = invert ? 'text-ok-text' : 'text-alert-text';
  const benefitColor = invert ? 'text-alert-text' : 'text-ok-text';
  const stressSign = invert ? '−' : '+';
  return (
    <div className="space-y-0.5 py-1 pl-6 text-[12px]">
      {stressors.map((s) => (
        <div key={`s-${s.key}`} className={`flex justify-between ${stressColor}`}>
          <span>{s.label}</span>
          <span className="font-mono tabular-nums">
            {stressSign}
            {s.amount.toFixed(2)}%/h
          </span>
        </div>
      ))}
      {benefits.map((b) => (
        <div key={`b-${b.key}`} className={`flex justify-between ${benefitColor}`}>
          <span>{b.label}</span>
          <span className="font-mono tabular-nums">+{b.amount.toFixed(2)}%/h</span>
        </div>
      ))}
    </div>
  );
}

function PlantRow({
  plant,
  vitality,
  expanded,
  onToggle,
  onRemove,
}: {
  plant: Plant;
  vitality: VitalityResult;
  expanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
}): React.JSX.Element {
  const name = PLANT_SPECIES_DATA[plant.species].name;
  const net = vitality.breakdown.net;
  const stressors = vitality.breakdown.stressors.filter((s) => s.amount > 0);
  const benefits = vitality.breakdown.benefits.filter((b) => b.amount > 0);
  const status = conditionStatus(plant.condition);

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 rounded py-2.5 text-left transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <Caret open={expanded} />
        <span className="text-[15px] font-medium text-ink">{name}</span>
        <span className="font-mono tabular-nums text-[13px] text-ink-3">{plant.size.toFixed(0)}%</span>
        {Math.abs(net) >= TREND_EPSILON && (
          <span className={`font-mono tabular-nums text-[12px] ${net > 0 ? 'text-ok-text' : 'text-alert-text'}`}>
            {net > 0 ? '+' : ''}
            {net.toFixed(1)}%/h
          </span>
        )}
        <span className="ml-auto flex items-center gap-3">
          <span className={`text-[12px] ${statusText(status)}`}>{conditionWord(plant.condition)}</span>
          <Bar className="w-24" value={plant.condition} status={status} />
        </span>
      </button>
      {expanded && (
        <div className="pb-1">
          {(stressors.length > 0 || benefits.length > 0) && (
            <Breakdown stressors={stressors} benefits={benefits} />
          )}
          <div className="flex justify-end pl-6">
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove ${name}`}
              className="flex items-center gap-1 rounded text-[12px] text-ink-3 transition-colors hover:text-alert focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <X className="h-3.5 w-3.5" />
              remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface FloraCardProps {
  state: SimulationState;
  config: TunableConfig;
  executeAction: (action: Action) => void;
}

export function FloraCard({ state, config, executeAction }: FloraCardProps): React.JSX.Element {
  const [expandedPlants, setExpandedPlants] = useState<Set<string>>(new Set());
  const [algaeExpanded, setAlgaeExpanded] = useState(false);

  const { plants, algae, resources } = state;
  const water = resources.water;
  const maxPlants = getMaxPlants(state.tank.capacity);
  const algaePct = Math.round(algae.mass);

  const algaePopulation = computeAlgaePopulation({
    plants,
    resources,
    tankCapacity: state.tank.capacity,
    algaeConfig: config.algae,
    nutrientsConfig: config.nutrients,
  });

  const nutrients = nutrientReadings(resources, water);
  const allDepleted = allNutrientsDepleted(nutrients);

  const togglePlant = (id: string): void =>
    setExpandedPlants((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const canTrim = canTrimPlants(state);
  const trimOptions: SplitOption[] = trimTargets(state).map(({ target, count, disabled }) => ({
    key: String(target),
    label: `trim to ${target}%`,
    hint: `${count} plant${count === 1 ? '' : 's'}`,
    disabled,
    onSelect: () => executeAction({ type: 'trimPlants', targetSize: target }),
  }));

  const doseOptions: SplitOption[] = dosePresets(water).map(({ ml, nitratePpm }) => ({
    key: String(ml),
    label: `${ml} ml`,
    hint: `+${nitratePpm.toFixed(1)} NO₃`,
    onSelect: () => executeAction({ type: 'dose', amountMl: ml }),
  }));

  return (
    <Card className="lg:min-h-[520px]">
      <CardHeader
        title="Flora & Scape"
        meta={
          <span>
            {plants.length}/{maxPlants} plants · algae {algaePct}%
          </span>
        }
      />
      <CardBody>
        <div className="divide-y divide-hairline">
          {plants.length === 0 ? (
            <p className="py-4 text-[13px] text-ink-3">No plants yet — add flora in Build.</p>
          ) : (
            plants.map((plant) => {
              const nutrientSufficiency = calculateNutrientSufficiency(
                resources,
                water,
                plant.species,
                config.nutrients
              );
              const vitality = computePlantVitality({
                plant,
                resources,
                waterVolume: water,
                plantsConfig: config.plants,
                nutrientSufficiency,
                algaeMass: algae.mass,
              });
              return (
                <PlantRow
                  key={plant.id}
                  plant={plant}
                  vitality={vitality}
                  expanded={expandedPlants.has(plant.id)}
                  onToggle={() => togglePlant(plant.id)}
                  onRemove={() => executeAction({ type: 'removePlant', plantId: plant.id })}
                />
              );
            })
          )}

          {/* Algae */}
          <div>
            <button
              type="button"
              onClick={() => setAlgaeExpanded((v) => !v)}
              aria-expanded={algaeExpanded}
              className="flex w-full items-center gap-3 rounded py-2.5 text-left transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <Caret open={algaeExpanded} />
              <span className="text-[15px] font-medium text-ink">Algae</span>
              <span className="font-mono tabular-nums text-[13px] text-ink-3">{algaePct}%</span>
              <span className="ml-auto flex items-center gap-3">
                <span className={`text-[12px] ${statusText(algaeStatus(algae.mass))}`}>
                  {algaeWord(algae.mass)}
                </span>
                <Bar className="w-24" value={algae.mass} status={algaeStatus(algae.mass)} />
              </span>
            </button>
            {algaeExpanded &&
              (algaePopulation.breakdown.stressors.some((s) => s.amount > 0) ||
                algaePopulation.breakdown.benefits.some((b) => b.amount > 0)) && (
                <Breakdown
                  stressors={algaePopulation.breakdown.stressors.filter((s) => s.amount > 0)}
                  benefits={algaePopulation.breakdown.benefits.filter((b) => b.amount > 0)}
                  invert
                />
              )}
          </div>

          {/* Nutrients */}
          <div className="flex items-center gap-3 py-2.5">
            <span className="text-[13px] text-ink-2">Nutrients</span>
            <span className="flex flex-wrap items-center gap-1.5">
              {nutrients.map((n) => (
                <span
                  key={n.label}
                  title={`${n.ppm.toFixed(2)} ppm`}
                  className={`rounded-badge border px-1.5 py-0.5 text-[11px] font-medium ${NUTRIENT_CHIP[n.state]}`}
                >
                  {n.label}
                </span>
              ))}
            </span>
            {allDepleted && (
              <span className="ml-auto">
                <Pill variant="warn">all depleted</Pill>
              </span>
            )}
          </div>

          {/* Scape */}
          <div className="flex items-center gap-3 py-2.5">
            <span className="text-[13px] text-ink-2">Scape</span>
            <span className="min-w-0 truncate text-[13px] text-ink">
              {scapeSummary(state.equipment.substrate.type, state.equipment.hardscape.items)}
            </span>
            <span className="ml-auto font-mono tabular-nums text-[12px] text-ink-3">
              {SurfaceResource.format(resources.surface)}
            </span>
          </div>
        </div>
      </CardBody>

      <CardFooter>
        <SplitButton label="Trim" options={trimOptions} disabled={!canTrim} ariaLabel="Trim plants" />
        <RunButton
          onClick={() => executeAction({ type: 'scrubAlgae' })}
          disabled={algae.mass < MIN_ALGAE_TO_SCRUB}
        >
          Scrub
        </RunButton>
        <SplitButton label="Dose" options={doseOptions} ariaLabel="Dose fertilizer" />
        <span className="ml-auto text-[12px] text-ink-3">
          {allDepleted ? 'nutrients depleted — dose to feed plants' : 'nutrients react here'}
        </span>
      </CardFooter>
    </Card>
  );
}
