import React, { useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import type { LidType } from '../../simulation/index.js';
import type { TunableConfig } from '../../simulation/config/index.js';
import type { useSimulation } from '../hooks/useSimulation';
import { usePresetSwitch } from '../hooks/usePresetSwitch';
import { useUnits } from '../hooks/useUnits';
import { Stage } from '../components/layout/Stage';
import { PresetPicker } from '../components/scenario/PresetPicker';
import { DataRow, FieldLabel, RunButton } from '../components/run/elements';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { FieldRow } from '../components/ui/FieldRow';
import { PlaceholderButton } from '../components/ui/PlaceholderButton';
import { Segmented } from '../components/ui/Segmented';
import { Select } from '../components/ui/Select';
import { Stepper } from '../components/ui/Stepper';
import {
  RESET_CONFIRM_TICKS,
  environmentDerived,
  presetCards,
  resetConsequence,
} from '../build';
import { findClosestTankSize, formatVolume, getTankSizeOptions } from '../utils/units';

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

/**
 * The setup surface: everything here changes the world rather than acting
 * inside it, which is why the two destructive verbs are pinned to the stage
 * footer with their consequence spelled out beside them.
 */
export function ScenarioSection({
  sim,
  config,
}: {
  sim: ReturnType<typeof useSimulation>;
  config: TunableConfig;
}): React.JSX.Element {
  const { unitSystem, setUnitSystem, tempUnit, displayTemp, internalTemp } = useUnits();
  const { current, request } = usePresetSwitch();
  const [confirmReset, setConfirmReset] = useState(false);

  const { environment, equipment, tank } = sim.state;
  const cards = useMemo(() => presetCards(unitSystem), [unitSystem]);
  const derived = useMemo(() => environmentDerived(sim.state, config), [sim.state, config]);

  const consequence = resetConsequence(sim.state);
  const presetName = cards.find((card) => card.id === current)?.name ?? current;
  const roomDisplay = Math.round(displayTemp(environment.roomTemperature));
  const tapDisplay = Math.round(displayTemp(environment.tapWaterTemperature));
  const minTemp = unitSystem === 'imperial' ? 50 : 10;
  const maxTemp = unitSystem === 'imperial' ? 104 : 40;
  const minTapTemp = unitSystem === 'imperial' ? 41 : 5;
  const tankSizes = getTankSizeOptions(unitSystem);
  const currentTank = findClosestTankSize(tank.capacity, unitSystem);

  const askReset = (): void => {
    if (sim.state.tick > RESET_CONFIRM_TICKS) {
      setConfirmReset(true);
    } else {
      sim.reset();
    }
  };

  return (
    <Stage
      title="Scenario"
      meta={`${presetName} · ${formatVolume(tank.capacity, unitSystem, 0)}`}
      actions={
        <Segmented
          ariaLabel="Unit system"
          options={UNIT_OPTIONS}
          value={unitSystem}
          onChange={setUnitSystem}
        />
      }
      footer={
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-hairline px-3.5 py-2.5">
          <RunButton onClick={askReset}>
            <RotateCcw className="h-3.5 w-3.5" />
            Reset run
          </RunButton>
          <PlaceholderButton label="Duplicate scenario" title="Coming with saved scenarios" />
          <p className="min-w-0 flex-1 text-[12px] leading-[1.45] text-ink-3">{consequence}</p>
        </div>
      }
    >
      <div className="flex min-h-full flex-col gap-5 lg:flex-row">
        <section className="flex flex-col gap-2 lg:w-[46%] lg:max-w-[500px]">
          <FieldLabel>Preset</FieldLabel>
          <p className="text-[12px] leading-[1.5] text-ink-3">
            Every preset builds an empty tank — no plants, no fish.
          </p>
          <PresetPicker
            cards={cards}
            current={current}
            modified={sim.isPresetModified}
            onSelect={request}
            onRestore={() => request(current)}
          />
        </section>

        <section className="flex min-w-0 flex-1 flex-col gap-5">
          <div>
            <FieldLabel>Environment</FieldLabel>
            <div className="divide-y divide-hairline">
              <FieldRow label="Tank">
                <Select
                  ariaLabel="Tank size"
                  value={String(currentTank.liters)}
                  onChange={(v) => sim.changeTankCapacity(Number(v))}
                  options={tankSizes.map((size) => ({
                    value: String(size.liters),
                    label: size.display,
                  }))}
                />
              </FieldRow>

              <FieldRow label="Lid">
                <Select
                  ariaLabel="Lid type"
                  value={equipment.lid.type}
                  onChange={(v) => sim.updateLidType(v as LidType)}
                  options={LID_OPTIONS}
                />
              </FieldRow>

              <FieldRow label="Room temperature">
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
          </div>

          <div>
            <FieldLabel>Derived</FieldLabel>
            <div className="divide-y divide-hairline">
              {derived.map((reading) => (
                <DataRow key={reading.label} label={reading.label}>
                  {reading.value}
                  {reading.note && (
                    <span className="ml-1.5 text-[11px] text-ink-3">· {reading.note}</span>
                  )}
                </DataRow>
              ))}
            </div>
          </div>
        </section>
      </div>

      <ConfirmDialog
        isOpen={confirmReset}
        title="Reset run?"
        message={consequence}
        confirmLabel="Reset"
        onConfirm={() => {
          setConfirmReset(false);
          sim.reset();
        }}
        onCancel={() => setConfirmReset(false)}
      />
    </Stage>
  );
}
