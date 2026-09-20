import React, { useMemo, useState } from 'react';
import type { LidType } from '../../simulation/index.js';
import type { TunableConfig } from '../../simulation/config/index.js';
import { PRESETS, presetName, type PresetId } from '../../simulation/presets.js';
import { version } from '../../../package.json';
import { ModuleGroup, ModulePage } from '../components/layout/ModulePage';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { FieldRow } from '../components/ui/FieldRow';
import { Segmented } from '../components/ui/Segmented';
import { Select } from '../components/ui/Select';
import { Stepper } from '../components/ui/Stepper';
import { VerbButton } from '../components/ui/VerbButton';
import { usePresetLoad } from '../hooks/usePresetLoad';
import type { useSimulation } from '../hooks/useSimulation';
import { useTheme, type ThemeMode } from '../hooks/useTheme';
import { useUnits, type UnitSystem } from '../hooks/useUnits';
import { DOCS_URL, REPO_URL } from '../nav';
import {
  LID_LABEL,
  LID_TYPES,
  RESET_CONFIRM_TICKS,
  driftsFromPreset,
  environmentNotes,
  resetConsequence,
  resizeConsequence,
} from '../build';
import { TICKS_PER_DAY, formatDayClock, formatElapsed } from '../utils/clock';
import { formatVolume, getTankSizeOptions } from '../utils/units';
import { CONTROL_FOCUS } from '../components/ui/focus';

const PRESET_OPTIONS = PRESETS.map((preset) => ({ value: preset.id, label: preset.name }));
const LID_OPTIONS = LID_TYPES.map((value) => ({ value, label: LID_LABEL[value] }));

const UNIT_OPTIONS: { value: UnitSystem; label: string }[] = [
  { value: 'metric', label: 'L/°C' },
  { value: 'imperial', label: 'gal/°F' },
];

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const LINK =
  `text-[13px] text-accent underline-offset-2 hover:underline ${CONTROL_FOCUS}`;

/** A row whose right-hand side is a figure rather than a control. */
function Figure({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <span className="text-[14px] tabular-nums text-ink">{children}</span>;
}

/**
 * What the tank *is*, rather than how it is doing: the preset it came from
 * and the vessel it built, the room around it, how this reader wants it
 * drawn, and what the run has cost so far. Every row is a field, so nothing
 * here needs reading — only setting.
 */
export function SetupSection({
  sim,
  config,
}: {
  sim: ReturnType<typeof useSimulation>;
  config: TunableConfig;
}): React.JSX.Element {
  const { unitSystem, setUnitSystem, tempUnit, displayTemp, internalTemp } = useUnits();
  const { mode, setMode } = useTheme();
  const { current, request } = usePresetLoad();
  const [confirmReset, setConfirmReset] = useState(false);
  const [resizeTo, setResizeTo] = useState<number | null>(null);

  const { environment, equipment, tank, tick } = sim.state;
  const notes = useMemo(
    () => environmentNotes(sim.state, config, unitSystem),
    [sim.state, config, unitSystem]
  );
  const drifted = driftsFromPreset(sim.state, current);
  const consequence = resetConsequence(sim.state);

  const roomDisplay = Math.round(displayTemp(environment.roomTemperature));
  const tapDisplay = Math.round(displayTemp(environment.tapWaterTemperature));
  const minTemp = unitSystem === 'imperial' ? 50 : 10;
  const maxTemp = unitSystem === 'imperial' ? 104 : 40;
  const minTapTemp = unitSystem === 'imperial' ? 41 : 5;
  const sizes = getTankSizeOptions(unitSystem, tank.capacity);

  const askReset = (): void => {
    if (tick > RESET_CONFIRM_TICKS) setConfirmReset(true);
    else sim.reset();
  };

  const askResize = (capacity: number): void => {
    if (tick > RESET_CONFIRM_TICKS) setResizeTo(capacity);
    else sim.changeTankCapacity(capacity);
  };

  return (
    <ModulePage title="Setup" meta={drifted ? `${presetName(current)} · modified` : presetName(current)}>
      <div className="grid max-w-[880px] grid-cols-1 items-start gap-x-8 gap-y-1 md:grid-cols-2">
        <div>
          <ModuleGroup
            title="Tank"
            action={
              drifted ? (
                <VerbButton label="Restore defaults" onClick={() => request(current)} />
              ) : undefined
            }
          >
            <div className="divide-y divide-hairline">
              <FieldRow label="Preset" note={drifted ? 'the tank has moved from it' : undefined}>
                <Select
                  ariaLabel="Tank preset"
                  value={current}
                  onChange={(value) => request(value as PresetId)}
                  options={PRESET_OPTIONS}
                />
              </FieldRow>

              <FieldRow label="Capacity">
                <Figure>{formatVolume(tank.capacity, unitSystem, 0)}</Figure>
              </FieldRow>

              <FieldRow label="Resize" note="a new tank at hour zero">
                <Select
                  ariaLabel="Tank size"
                  value={String(tank.capacity)}
                  onChange={(value) => askResize(Number(value))}
                  options={sizes.map((size) => ({
                    value: String(size.liters),
                    label: size.display,
                  }))}
                />
              </FieldRow>

              <FieldRow label="Lid" note={notes.lid}>
                <Select
                  ariaLabel="Lid type"
                  value={equipment.lid.type}
                  onChange={(value) => sim.updateLidType(value as LidType)}
                  options={LID_OPTIONS}
                />
              </FieldRow>
            </div>
          </ModuleGroup>

          <ModuleGroup title="Room">
            <div className="divide-y divide-hairline">
              <FieldRow label="Room temperature" note={notes.room}>
                <Stepper
                  ariaLabel="Room temperature"
                  value={roomDisplay}
                  min={minTemp}
                  max={maxTemp}
                  display={`${roomDisplay}${tempUnit}`}
                  onChange={(value) => sim.updateRoomTemperature(internalTemp(value))}
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
                  onChange={(value) => sim.updateTapWaterPH(Number(value.toFixed(1)))}
                />
              </FieldRow>

              <FieldRow label="Tap water temperature">
                <Stepper
                  ariaLabel="Tap water temperature"
                  value={tapDisplay}
                  min={minTapTemp}
                  max={maxTemp}
                  display={`${tapDisplay}${tempUnit}`}
                  onChange={(value) => sim.updateTapWaterTemperature(internalTemp(value))}
                />
              </FieldRow>
            </div>
          </ModuleGroup>
        </div>

        <div>
          <ModuleGroup title="Display">
            <div className="divide-y divide-hairline">
              <FieldRow label="Units">
                <Segmented
                  ariaLabel="Unit system"
                  options={UNIT_OPTIONS}
                  value={unitSystem}
                  onChange={setUnitSystem}
                />
              </FieldRow>

              <FieldRow label="Theme">
                <Segmented
                  ariaLabel="Theme"
                  options={THEME_OPTIONS}
                  value={mode}
                  onChange={setMode}
                />
              </FieldRow>
            </div>
          </ModuleGroup>

          <ModuleGroup title="Run">
            <div className="divide-y divide-hairline">
              <FieldRow label="Started" note={formatDayClock(tick)}>
                <Figure>{tick === 0 ? 'just now' : `${formatElapsed(tick)} ago`}</Figure>
              </FieldRow>

              <FieldRow label="Ticks" note={`${TICKS_PER_DAY} to the day`}>
                <Figure>{tick}</Figure>
              </FieldRow>

              <FieldRow label="Reset" note="the tank stays, the run goes">
                <VerbButton label="Reset run" onClick={askReset} />
              </FieldRow>
            </div>
          </ModuleGroup>

          <ModuleGroup title="About">
            <div className="divide-y divide-hairline">
              <FieldRow label="Version">
                <Figure>{version}</Figure>
              </FieldRow>

              <FieldRow label="Documentation">
                <a href={DOCS_URL} target="_blank" rel="noreferrer" className={LINK}>
                  docs.fishroom.app
                </a>
              </FieldRow>

              <FieldRow label="Source">
                <a href={REPO_URL} target="_blank" rel="noreferrer" className={LINK}>
                  GitHub
                </a>
              </FieldRow>
            </div>
            <p className="max-w-[46ch] pt-2 text-[12px] leading-[1.5] text-ink-3">
              A simulation built on one fishkeeper&rsquo;s experience and judgement, not a
              laboratory model.
            </p>
          </ModuleGroup>
        </div>
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

      <ConfirmDialog
        isOpen={resizeTo !== null}
        title="Resize tank?"
        message={resizeTo === null ? '' : resizeConsequence(sim.state, resizeTo, unitSystem)}
        confirmLabel="Resize"
        onConfirm={() => {
          if (resizeTo !== null) sim.changeTankCapacity(resizeTo);
          setResizeTo(null);
        }}
        onCancel={() => setResizeTo(null)}
      />
    </ModulePage>
  );
}
