import React, { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { calculateEvaporationRatePerDay, type LidType } from '../../../simulation/index.js';
import type { TunableConfig } from '../../../simulation/config/index.js';
import type { useSimulation } from '../../hooks/useSimulation';
import { PRESETS, type PresetId } from '../../presets.js';
import { useUnits } from '../../hooks/useUnits';
import { getTankSizeOptions, findClosestTankSize } from '../../utils/units';
import { useCardCollapse } from '../../hooks/useCardCollapse';
import { Card, CardBody, CardFooter, CardHeader, CollapseRegion } from '../run/Card';
import { RunButton } from '../run/elements';
import { Segmented } from '../ui/Segmented';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { FieldRow, PlaceholderButton, Select, Stepper } from './controls';

const LID_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'mesh', label: 'Mesh' },
  { value: 'full', label: 'Full' },
  { value: 'sealed', label: 'Sealed' },
];

const UNIT_OPTIONS = [
  { value: 'metric' as const, label: 'L/°C' },
  { value: 'imperial' as const, label: 'gal/°F' },
];

interface ScenarioColumnProps {
  sim: ReturnType<typeof useSimulation>;
  config: TunableConfig;
}

export function ScenarioColumn({ sim, config }: ScenarioColumnProps): React.JSX.Element {
  const { state } = sim;
  const { unitSystem, setUnitSystem, tempUnit, displayTemp, internalTemp } = useUnits();
  const { collapsed, toggle, showToggle, regionId } = useCardCollapse('build.scenario');
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const { environment, equipment, resources, tank } = state;
  const roomDisplay = Math.round(displayTemp(environment.roomTemperature));
  const tapDisplay = Math.round(displayTemp(environment.tapWaterTemperature));
  const minTemp = unitSystem === 'imperial' ? 50 : 10;
  const maxTemp = unitSystem === 'imperial' ? 104 : 40;
  const minTapTemp = unitSystem === 'imperial' ? 41 : 5;

  const evapRate = calculateEvaporationRatePerDay(
    resources.temperature,
    environment.roomTemperature,
    equipment.lid.type,
    config.evaporation
  );
  const evapHint = evapRate === 0 ? 'sealed' : `evap ${evapRate.toFixed(1)}%/d`;

  const tankSizes = getTankSizeOptions(unitSystem);
  const currentTank = findClosestTankSize(tank.capacity, unitSystem);
  const days = Math.floor(state.tick / 24);
  const summary = `${currentTank.display} · room ${roomDisplay}${tempUnit}`;

  return (
    <Card className="h-full">
      <CardHeader
        title="Scenario"
        collapsible={showToggle}
        collapsed={collapsed}
        onToggle={toggle}
        regionId={regionId}
        meta={collapsed ? <span className="sm:hidden">{summary}</span> : undefined}
      />
      <CollapseRegion collapsed={collapsed} id={regionId}>
      <CardBody>
        <div className="divide-y divide-hairline">
          <FieldRow label="Preset">
            <Select
              ariaLabel="Scenario preset"
              value={sim.currentPreset}
              onChange={(v) => sim.loadPreset(v as PresetId)}
              options={PRESETS.map((p) => ({ value: p.id, label: p.name }))}
            />
          </FieldRow>

          <FieldRow label="Tank">
            <Select
              ariaLabel="Tank size"
              value={String(currentTank.liters)}
              onChange={(v) => sim.changeTankCapacity(Number(v))}
              options={tankSizes.map((s) => ({ value: String(s.liters), label: s.display }))}
            />
          </FieldRow>

          <FieldRow label="Units">
            <Segmented
              ariaLabel="Unit system"
              options={UNIT_OPTIONS}
              value={unitSystem}
              onChange={setUnitSystem}
            />
          </FieldRow>

          <FieldRow label="Lid">
            <Select
              ariaLabel="Lid type"
              value={equipment.lid.type}
              onChange={(v) => sim.updateLidType(v as LidType)}
              options={LID_OPTIONS}
            />
            <span className="text-[12px] text-ink-3">{evapHint}</span>
          </FieldRow>

          <FieldRow label="Room temp">
            <Stepper
              ariaLabel="Room temperature"
              value={roomDisplay}
              min={minTemp}
              max={maxTemp}
              display={`${roomDisplay}${tempUnit}`}
              onChange={(v) => sim.updateRoomTemperature(internalTemp(v))}
            />
          </FieldRow>

          <FieldRow label="Tap water pH">
            <Stepper
              ariaLabel="Tap water pH"
              value={environment.tapWaterPH}
              min={5.5}
              max={8.5}
              step={0.1}
              display={environment.tapWaterPH.toFixed(1)}
              onChange={(v) => sim.updateTapWaterPH(Number(v.toFixed(1)))}
            />
          </FieldRow>

          <FieldRow label="Tap water temp">
            <Stepper
              ariaLabel="Tap water temperature"
              value={tapDisplay}
              min={minTapTemp}
              max={maxTemp}
              display={`${tapDisplay}${tempUnit}`}
              onChange={(v) => sim.updateTapWaterTemperature(internalTemp(v))}
            />
          </FieldRow>
        </div>
      </CardBody>

      <CardFooter>
        <RunButton onClick={() => setShowResetConfirm(true)}>
          <RotateCcw className="h-3.5 w-3.5" />
          Reset run
        </RunButton>
        <span className="ml-auto">
          <PlaceholderButton label="duplicate" title="Coming with saved scenarios" />
        </span>
      </CardFooter>
      </CollapseRegion>

      <ConfirmDialog
        isOpen={showResetConfirm}
        title="Reset run?"
        message={`This resets the clock, resources, and alerts${days > 0 ? ` — ${days} day${days === 1 ? '' : 's'} of progress` : ''}, keeping your equipment, scape, and stocking.`}
        confirmLabel="Reset"
        onConfirm={() => {
          setShowResetConfirm(false);
          sim.reset();
        }}
        onCancel={() => setShowResetConfirm(false)}
      />
    </Card>
  );
}
