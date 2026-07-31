import { useEffect } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { ScenarioSection } from './ScenarioSection';
import { UnitsProvider, useUnits, type UnitSystem } from '../hooks/useUnits';
import { PresetSwitchProvider } from '../hooks/usePresetSwitch';
import { PersistenceProvider } from '../persistence/index.js';
import { RESET_CONFIRM_TICKS } from '../build';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import { createSimulation, type SimulationState } from '../../simulation/index.js';
import type { useSimulation } from '../hooks/useSimulation';
import type { PresetId } from '../presets.js';
import { RAIL_QUERY } from '../hooks/useMediaQuery';
import { stubMatchMedia, type MatchMediaStub } from '../test/matchMedia';

let media: MatchMediaStub;

beforeEach(() => {
  media = stubMatchMedia((query) => query === RAIL_QUERY);
});

afterEach(() => {
  media.restore();
  globalThis.localStorage.clear();
  cleanup();
});

const planted: SimulationState = createSimulation({
  tankCapacity: 40,
  filter: { enabled: true, type: 'canister' },
  substrate: { type: 'aqua_soil' },
});

/** Stub of the sim hook: real engine state, a fresh vi.fn() per callback. */
function stubSim(
  state: SimulationState,
  extras: { isPresetModified?: boolean } = {}
): ReturnType<typeof useSimulation> {
  const cache = new Map<string, ReturnType<typeof vi.fn>>();
  return new Proxy(
    { state, isPresetModified: extras.isPresetModified ?? false },
    {
      get(target: Record<string, unknown>, prop: string): unknown {
        if (prop in target) return target[prop];
        if (!cache.has(prop)) cache.set(prop, vi.fn());
        return cache.get(prop);
      },
    }
  ) as unknown as ReturnType<typeof useSimulation>;
}

/**
 * The reader's units come from their locale, so every test names one. Set on
 * mount only — a test that reaches for the toggle must not be undone by it.
 */
function ForceUnits({ system }: { system: UnitSystem }): null {
  const { setUnitSystem } = useUnits();
  useEffect(() => setUnitSystem(system), [system, setUnitSystem]);
  return null;
}

function renderSection(
  sim: ReturnType<typeof useSimulation>,
  options: { current?: PresetId; onLoad?: (id: PresetId) => void; units?: UnitSystem } = {}
): void {
  render(
    <PersistenceProvider>
      <UnitsProvider>
        <ForceUnits system={options.units ?? 'metric'} />
        <PresetSwitchProvider current={options.current ?? 'planted'} onLoad={options.onLoad ?? vi.fn()}>
          <ScenarioSection sim={sim} config={DEFAULT_CONFIG} />
        </PresetSwitchProvider>
      </UnitsProvider>
    </PersistenceProvider>
  );
}

describe('ScenarioSection', () => {
  it('lets the stage title stand alone — no card repeats it', () => {
    renderSection(stubSim(planted));
    expect(screen.getAllByText('Scenario')).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Scenario');
  });

  it('offers every preset, states the tank each builds, and promises no livestock', () => {
    renderSection(stubSim(planted));

    expect(screen.getByText(/Every preset builds an empty tank/)).toBeTruthy();
    // The loaded preset is not a switch target, so four of the five are buttons.
    for (const name of ['Bare Tank', 'Betta Cube', 'Balanced Community', 'Big Angelfish Tank']) {
      expect(screen.getByRole('button', { name: new RegExp(name) })).toBeTruthy();
    }
    expect(screen.getByText('Betta Cube').closest('button')?.textContent).toContain(
      '50 W heater → 26°C'
    );
  });

  it('sends a preset pick through the confirmation rather than loading it', () => {
    const onLoad = vi.fn();
    renderSection(stubSim(planted), { onLoad });

    fireEvent.click(screen.getByRole('button', { name: /Bare Tank/ }));
    expect(onLoad).not.toHaveBeenCalled();
    expect(screen.getByText('Switch preset?')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Switch' }));
    expect(onLoad).toHaveBeenCalledWith('bare');
  });

  it('offers Restore defaults only once the preset has been modified, and confirms it', () => {
    renderSection(stubSim(planted));
    expect(screen.queryByRole('button', { name: /Restore defaults/ })).toBeNull();

    cleanup();
    const onLoad = vi.fn();
    renderSection(stubSim(planted, { isPresetModified: true }), { onLoad });

    fireEvent.click(screen.getByRole('button', { name: /Restore defaults/ }));
    expect(onLoad).not.toHaveBeenCalled();
    expect(screen.getByText('Restore defaults?')).toBeTruthy();
    expect(screen.getByText(/back to the “Planted Tank” defaults/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(onLoad).toHaveBeenCalledWith('planted');
  });

  it('resets without interrupting inside the confirmation threshold', () => {
    const sim = stubSim({ ...planted, tick: RESET_CONFIRM_TICKS });
    renderSection(sim);

    fireEvent.click(screen.getByRole('button', { name: /Reset run/ }));

    expect(screen.queryByText('Reset run?')).toBeNull();
    expect(sim.reset).toHaveBeenCalledTimes(1);
  });

  it('stops to confirm once the run is worth losing, and only resets on Reset', () => {
    const sim = stubSim({ ...planted, tick: RESET_CONFIRM_TICKS + 1 });
    renderSection(sim);

    fireEvent.click(screen.getByRole('button', { name: /Reset run/ }));
    expect(sim.reset).not.toHaveBeenCalled();

    const dialog = screen.getByText('Reset run?').parentElement as HTMLElement;
    expect(within(dialog).getByText(/30 days/)).toBeTruthy();
    expect(within(dialog).getByText(/Equipment, scape, plants and fish stay/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(sim.reset).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Reset run/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(sim.reset).toHaveBeenCalledTimes(1);
  });

  it('states what reset costs in the footer, whether or not it will interrupt', () => {
    renderSection(stubSim(planted));
    expect(screen.getByText(/Reset clears the clock, water chemistry, alerts/)).toBeTruthy();
  });

  it('drives the environment fields and the units toggle through the sim', () => {
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
  });

  it('re-reads every figure — preset cards included — in the reader’s units', () => {
    renderSection(stubSim(planted));

    expect(screen.getAllByText('40 L').length).toBeGreaterThan(0);
    expect(screen.getByText('Betta Cube').closest('button')?.textContent).toContain('hob 120 L/h');

    fireEvent.click(screen.getByRole('button', { name: 'gal/°F' }));

    expect(screen.queryByText('40 L')).toBeNull();
    expect(screen.getByText('Betta Cube').closest('button')?.textContent).toContain('hob 32 GPH');
    expect(screen.getAllByText(/°F/).length).toBeGreaterThan(0);
  });

  it('derives the consequences of the environment from the engine', () => {
    renderSection(stubSim(planted));

    // 40 L on a canister: 320 L/h ÷ 40 L.
    expect(screen.getByText('8.0 ×/h')).toBeTruthy();
    expect(screen.getByText('Bacteria surface')).toBeTruthy();
    expect(screen.getByText('Plant slots')).toBeTruthy();
  });
});
