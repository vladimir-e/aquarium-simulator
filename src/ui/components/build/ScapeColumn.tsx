import React, { useState } from 'react';
import { X } from 'lucide-react';
import {
  getHardscapeName,
  getHardscapeSurface,
  getHardscapePHEffect,
  getMaxPlants,
  PLANT_SPECIES_DATA,
  type HardscapeType,
  type PlantSpecies,
  type SubstrateType,
} from '../../../simulation/index.js';
import type { useSimulation } from '../../hooks/useSimulation';
import { useUnits } from '../../hooks/useUnits';
import { plantOptions, substrateConsequence, substrateSurface } from '../../build';
import { useCardCollapse } from '../../hooks/useCardCollapse';
import { Card, CardBody, CardFooter, CardHeader, CollapseRegion } from '../run/Card';
import { Pill, RunButton } from '../run/elements';
import { SplitButton, type SplitOption } from '../run/SplitButton';
import { FieldRow, Select } from './controls';

type Sim = ReturnType<typeof useSimulation>;

const SUBSTRATE_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'sand', label: 'Sand' },
  { value: 'gravel', label: 'Gravel' },
  { value: 'aqua_soil', label: 'Aqua Soil' },
];

const HARDSCAPE_TYPES: HardscapeType[] = [
  'neutral_rock',
  'calcite_rock',
  'driftwood',
  'plastic_decoration',
];

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="ml-auto rounded p-0.5 text-ink-3 transition-colors hover:text-alert focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <X className="h-3.5 w-3.5" />
    </button>
  );
}

interface ScapeColumnProps {
  sim: Sim;
}

export function ScapeColumn({ sim }: ScapeColumnProps): React.JSX.Element {
  const { unitSystem } = useUnits();
  const { collapsed, toggle, showToggle, regionId } = useCardCollapse('build.scape');
  const { equipment, tank, plants, resources } = sim.state;
  const substrate = equipment.substrate.type;
  const hardscape = equipment.hardscape.items;
  const slots = tank.hardscapeSlots;
  const surface = substrateSurface(substrate, tank.capacity, unitSystem);
  const maxPlants = getMaxPlants(tank.capacity);
  const substrateLabel = SUBSTRATE_OPTIONS.find((o) => o.value === substrate)?.label ?? substrate;
  const summary = `${substrateLabel.toLowerCase()} + ${hardscape.length} · ${plants.length} plants`;

  const options = plantOptions(substrate);
  const [plantToAdd, setPlantToAdd] = useState<PlantSpecies>('java_fern');
  const selectedCompatible = options.find((o) => o.species === plantToAdd)?.compatible ?? false;
  const canAddPlant = selectedCompatible && plants.length < maxPlants;

  const hardscapeOptions: SplitOption[] = HARDSCAPE_TYPES.map((type) => ({
    key: type,
    label: getHardscapeName(type),
    onSelect: () => sim.addHardscapeItem(type),
  }));

  return (
    <Card className="h-full">
      <CardHeader
        title="Scape & Flora"
        collapsible={showToggle}
        collapsed={collapsed}
        onToggle={toggle}
        regionId={regionId}
        meta={collapsed ? <span className="sm:hidden">{summary}</span> : undefined}
      />
      <CollapseRegion collapsed={collapsed} id={regionId}>
      <CardBody>
        <FieldRow label="Substrate">
          <Select
            ariaLabel="Substrate"
            value={substrate}
            onChange={(v) => sim.updateSubstrateType(v as SubstrateType)}
            options={SUBSTRATE_OPTIONS}
          />
        </FieldRow>
        <div className="pb-3 text-[12px] text-ink-3">
          <span className="font-mono tabular-nums text-ink-2">{surface.perUnit.toLocaleString()}</span>{' '}
          {surface.unitLabel} · total{' '}
          <span className="font-mono tabular-nums text-ink-2">{surface.total.toLocaleString()}</span> cm²
          <div>{substrateConsequence(substrate)}</div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-hairline pt-3">
          <span className="flex items-center gap-2 text-[13px] text-ink-2">
            Hardscape
            <Pill variant="neutral">
              {hardscape.length}/{slots} slots
            </Pill>
          </span>
          <SplitButton
            label="Add"
            options={hardscapeOptions}
            disabled={hardscape.length >= slots}
            ariaLabel="Add hardscape"
          />
        </div>
        {hardscape.length > 0 && (
          <div className="divide-y divide-hairline pt-1">
            {hardscape.map((item) => {
              const phEffect = getHardscapePHEffect(item.type);
              return (
                <div key={item.id} className="flex items-center gap-2 py-1.5 text-[13px]">
                  <span className="text-ink">{getHardscapeName(item.type)}</span>
                  <span className="font-mono tabular-nums text-[12px] text-ink-3">
                    {getHardscapeSurface(item.type).toLocaleString()} cm²
                  </span>
                  {phEffect && <span className="text-[12px] text-ink-3">{phEffect.toLowerCase()}</span>}
                  <RemoveButton label={`Remove ${getHardscapeName(item.type)}`} onClick={() => sim.removeHardscapeItem(item.id)} />
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-hairline pt-3">
          <span className="flex items-center gap-2 text-[13px] text-ink-2">
            Plants
            <span className="font-mono tabular-nums text-[12px] text-ink-3">
              {plants.length}/{maxPlants}
            </span>
          </span>
          <span className="flex items-center gap-2">
            <Select
              ariaLabel="Plant species to add"
              value={plantToAdd}
              onChange={(v) => setPlantToAdd(v as PlantSpecies)}
              options={options.map((o) => ({
                value: o.species,
                label: o.compatible ? o.name : `${o.name} (needs substrate)`,
                disabled: !o.compatible,
              }))}
            />
            <RunButton
              disabled={!canAddPlant}
              onClick={() => sim.executeAction({ type: 'addPlant', species: plantToAdd })}
            >
              Add
            </RunButton>
          </span>
        </div>
        {plants.length > 0 && (
          <div className="divide-y divide-hairline pt-1">
            {plants.map((plant) => (
              <div key={plant.id} className="flex items-center gap-2 py-1.5 text-[13px]">
                <span className="text-ink">{PLANT_SPECIES_DATA[plant.species].name}</span>
                <span className="font-mono tabular-nums text-[12px] text-ink-3">{plant.size.toFixed(0)}%</span>
                <RemoveButton
                  label={`Remove ${PLANT_SPECIES_DATA[plant.species].name}`}
                  onClick={() => sim.executeAction({ type: 'removePlant', plantId: plant.id })}
                />
              </div>
            ))}
          </div>
        )}
      </CardBody>

      <CardFooter>
        <span className="text-[12px] text-ink-3">total bacteria surface</span>
        <span className="ml-auto font-mono text-[13px] tabular-nums text-ink-2">
          {Math.round(resources.surface).toLocaleString()} cm²
        </span>
      </CardFooter>
      </CollapseRegion>
    </Card>
  );
}
