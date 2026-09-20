import { useEffect } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { SetupSection } from './SetupSection';
import { ThemeProvider } from '../hooks/useTheme';
import { UnitsProvider, useUnits } from '../hooks/useUnits';
import { PresetLoadProvider } from '../hooks/usePresetLoad';
import { PersistenceProvider } from '../persistence/index.js';
import { RESET_CONFIRM_TICKS } from '../build';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import type { SimulationState } from '../../simulation/index.js';
import type { useSimulation } from '../hooks/useSimulation';
import { type PresetId } from '../../simulation/presets.js';
import { stubSim } from '../test/stubSim';
import { presetTank } from '../test/presetTank';

afterEach(() => {
  globalThis.localStorage.clear();
  cleanup();
});

const planted = presetTank('planted');
const progressed = presetTank('planted', { days: 5 });

/** The planted tank with its heater switched on — drift a restore would clear. */
const heated: SimulationState = {
  ...planted,
  equipment: { ...planted.equipment, heater: { ...planted.equipment.heater, enabled: true } },
};

/**
 * The reader's units come from their locale, so every test names one. Set on
 * mount only — a test that reaches for the toggle must not be undone by it.
 */
function ForceUnits(): null {
  const { setUnitSystem } = useUnits();
  useEffect(() => setUnitSystem('metric'), [setUnitSystem]);
  return null;
}

function renderSection(
  sim: ReturnType<typeof useSimulation>,
  onLoad: (id: PresetId) => void = vi.fn()
): void {
  render(
    <ThemeProvider>
      <PersistenceProvider>
        <UnitsProvider>
          <ForceUnits />
          <PresetLoadProvider current="planted" state={sim.state} onLoad={onLoad}>
            <SetupSection sim={sim} config={DEFAULT_CONFIG} />
          </PresetLoadProvider>
        </UnitsProvider>
      </PersistenceProvider>
    </ThemeProvider>
  );
}

function group(title: string): HTMLElement {
  return screen.getByRole('heading', { level: 2, name: title }).closest('section')!;
}

describe('SetupSection', () => {
  it('names the preset the tank came from in the page header', () => {
    renderSection(stubSim(planted));

    const header = screen.getByRole('heading', { level: 1, name: 'Setup' }).parentElement!;
    expect(within(header).getByText('Planted Tank')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Restore defaults' })).toBeNull();
  });

  it('flags the drift and offers the restore once the tank has moved', () => {
    const onLoad = vi.fn();
    renderSection(stubSim({ ...heated, tick: 5 * 24 }), onLoad);

    const header = screen.getByRole('heading', { level: 1, name: 'Setup' }).parentElement!;
    expect(within(header).getByText('Planted Tank · modified')).toBeTruthy();

    // Restoring is a preset load like any other, dialog and all.
    fireEvent.click(screen.getByRole('button', { name: 'Restore defaults' }));
    expect(onLoad).not.toHaveBeenCalled();
    expect(screen.getByText(/Starts “Planted Tank” as a new tank at hour zero\./)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(onLoad).toHaveBeenCalledWith('planted');
  });

  it('sends a preset pick through the confirmation rather than loading it', () => {
    const onLoad = vi.fn();
    renderSection(stubSim(progressed), onLoad);

    fireEvent.change(screen.getByRole('combobox', { name: 'Tank preset' }), {
      target: { value: 'bare' },
    });
    expect(onLoad).not.toHaveBeenCalled();
    expect(screen.getByText('Start a new tank?')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(onLoad).toHaveBeenCalledWith('bare');
  });

  it('drives the tank and environment fields through the sim', () => {
    const sim = stubSim(planted);
    renderSection(sim);

    fireEvent.change(screen.getByRole('combobox', { name: 'Tank size' }), {
      target: { value: '150' },
    });
    expect(sim.changeTankCapacity).toHaveBeenCalledWith(150);

    fireEvent.change(screen.getByRole('combobox', { name: 'Lid type' }), {
      target: { value: 'sealed' },
    });
    expect(sim.updateLidType).toHaveBeenCalledWith('sealed');

    const room = screen.getByRole('group', { name: 'Room temperature' });
    fireEvent.click(within(room).getByRole('button', { name: 'increase' }));
    expect(sim.updateRoomTemperature).toHaveBeenCalledWith(planted.environment.roomTemperature + 1);

    const ph = screen.getByRole('group', { name: 'Tap water pH' });
    fireEvent.click(within(ph).getByRole('button', { name: 'decrease' }));
    expect(sim.updateTapWaterPH).toHaveBeenCalledWith(
      Number((planted.environment.tapWaterPH - 0.1).toFixed(1))
    );
  });

  it('offers the lids in the one wording the rest of the app uses', () => {
    renderSection(stubSim(planted));
    const lid = screen.getByRole('combobox', { name: 'Lid type' });

    expect([...lid.querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      'no lid',
      'mesh lid',
      'full lid',
      'sealed lid',
    ]);
  });

  it('re-reads the capacity picker in the reader’s units, on round numbers', () => {
    renderSection(stubSim(planted));
    const sizes = (): (string | null)[] =>
      [...screen.getByRole('combobox', { name: 'Tank size' }).querySelectorAll('option')].map(
        (o) => o.textContent
      );

    expect(sizes()).toContain('40 L');
    expect(sizes().every((size) => size?.endsWith(' L'))).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'gal/°F' }));

    expect(sizes().every((size) => size?.endsWith(' gal'))).toBe(true);
    expect(sizes()).toContain('10 gal');
    expect(within(group('Room')).getAllByText(/°F/).length).toBeGreaterThan(0);
  });

  it('states what the environment does to the tank, in the engine’s own terms', () => {
    renderSection(stubSim(planted));
    const tank = group('Tank');

    expect(within(tank).getByText(/%\/d evaporates/)).toBeTruthy();
    expect(within(group('Room')).getByText(/the water (drifts|is already there)/)).toBeTruthy();
  });

  it('resets without interrupting inside the confirmation threshold', () => {
    const sim = stubSim({ ...planted, tick: RESET_CONFIRM_TICKS });
    renderSection(sim);

    fireEvent.click(screen.getByRole('button', { name: 'Reset run' }));

    expect(screen.queryByText('Reset run?')).toBeNull();
    expect(sim.reset).toHaveBeenCalledTimes(1);
  });

  it('stops to confirm once the run is worth losing, and only resets on Reset', () => {
    const sim = stubSim({ ...planted, tick: RESET_CONFIRM_TICKS + 1 });
    renderSection(sim);

    fireEvent.click(screen.getByRole('button', { name: 'Reset run' }));
    expect(sim.reset).not.toHaveBeenCalled();

    const dialog = screen.getByText('Reset run?').parentElement as HTMLElement;
    expect(within(dialog).getByText(/30 days/)).toBeTruthy();
    expect(within(dialog).getByText(/Equipment, scape, plants and fish stay/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(sim.reset).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Reset run' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(sim.reset).toHaveBeenCalledTimes(1);
  });

  it('counts the run in days and in ticks', () => {
    renderSection(stubSim({ ...planted, tick: 50 }));
    const run = group('Run');

    expect(within(run).getByText('2d 2h ago')).toBeTruthy();
    expect(within(run).getByText('50')).toBeTruthy();
  });

  it('holds the theme beside the units, and moves it', () => {
    renderSection(stubSim(planted));
    const display = group('Display');

    fireEvent.click(within(display).getByRole('button', { name: 'Light' }));
    expect(document.documentElement.classList.contains('light')).toBe(true);

    fireEvent.click(within(display).getByRole('button', { name: 'Dark' }));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('says what the simulation is, and links out to where it is explained', () => {
    renderSection(stubSim(planted));
    const about = group('About');

    expect(within(about).getByText(/one fishkeeper’s experience and judgement/)).toBeTruthy();
    expect(within(about).getByRole('link', { name: 'docs.fishroom.app' })).toBeTruthy();
    expect(within(about).getByRole('link', { name: 'GitHub' })).toBeTruthy();
  });
});
