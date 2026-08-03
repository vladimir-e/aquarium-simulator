import { useEffect } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { ScenarioSection } from './ScenarioSection';
import { UnitsProvider, useUnits } from '../hooks/useUnits';
import { PresetSwitchProvider } from '../hooks/usePresetSwitch';
import { PersistenceProvider } from '../persistence/index.js';
import { RESET_CONFIRM_TICKS, scenarioSummary } from '../build';
import { navFigures } from '../nav/figures';
import { emptyAggregates } from '../run';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import { applyAction, createSimulation, type SimulationState } from '../../simulation/index.js';
import type { useSimulation } from '../hooks/useSimulation';
import { getPresetById, type PresetId } from '../presets.js';
import { stubSim } from '../test/stubSim';

afterEach(() => {
  globalThis.localStorage.clear();
  cleanup();
});

const planted: SimulationState = createSimulation(getPresetById('planted')!.config);

/** The planted tank with its heater switched on — drift the restore would undo. */
const heated: SimulationState = {
  ...planted,
  equipment: {
    ...planted.equipment,
    heater: { ...planted.equipment.heater, enabled: true },
  },
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
    <PersistenceProvider>
      <UnitsProvider>
        <ForceUnits />
        <PresetSwitchProvider current="planted" onLoad={onLoad}>
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

  it('offers every preset, naming the tank each one sets up', () => {
    renderSection(stubSim(planted));

    // The loaded preset is not a switch target, so four of the five are buttons.
    for (const name of ['Bare Tank', 'Betta Cube', 'Balanced Community', 'Big Angelfish Tank']) {
      expect(screen.getByRole('button', { name: new RegExp(name) })).toBeTruthy();
    }
    expect(screen.getByText('Betta Cube').closest('button')?.textContent).toContain(
      'Gravel + rock + driftwood · sponge filter · heater · light · mesh lid'
    );
  });

  it('sends a preset pick through the confirmation rather than loading it', () => {
    const onLoad = vi.fn();
    renderSection(stubSim(planted), onLoad);

    fireEvent.click(screen.getByRole('button', { name: /Bare Tank/ }));
    expect(onLoad).not.toHaveBeenCalled();
    expect(screen.getByText('Switch preset?')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Switch' }));
    expect(onLoad).toHaveBeenCalledWith('bare');
  });

  it('says the tank still matches its preset until it does not', () => {
    renderSection(stubSim(planted));
    expect(screen.getByText('current')).toBeTruthy();
    expect(screen.queryByText('modified')).toBeNull();
    expect(screen.queryByRole('button', { name: /Restore defaults/ })).toBeNull();
  });

  it('flags the drift and offers the way back once the tank has moved', () => {
    const onLoad = vi.fn();
    renderSection(stubSim(heated), onLoad);

    expect(screen.getByText('modified')).toBeTruthy();
    expect(screen.queryByText('current')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Restore defaults/ }));
    expect(onLoad).not.toHaveBeenCalled();
    expect(screen.getByText('Restore defaults?')).toBeTruthy();
    expect(screen.getByText(/back to the “Planted Tank” defaults/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(onLoad).toHaveBeenCalledWith('planted');
  });

  it('does not call stocking drift — no preset carries fish, so none can restore them', () => {
    const stocked = applyAction(planted, { type: 'addFish', species: 'neon_tetra' }).state;
    renderSection(stubSim(stocked));

    expect(screen.getByText('current')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Restore defaults/ })).toBeNull();
  });

  it('names the drifted card’s build line as the restore target, not the live tank', () => {
    renderSection(stubSim({ ...heated, tank: { ...heated.tank, capacity: 150 } }));

    // The header quotes the live tank; the card quotes what Restore would build.
    expect(screen.getByRole('heading', { level: 1 }).parentElement?.textContent).toContain('150 L');
    expect(screen.getByText(/what Restore puts back/)).toBeTruthy();
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

  it('re-reads every figure — preset capacities included — in the reader’s units', () => {
    renderSection(stubSim(planted));

    expect(screen.getAllByText('40 L').length).toBeGreaterThan(0);
    expect(screen.getByText('Betta Cube').closest('button')?.textContent).toContain('20 L');

    fireEvent.click(screen.getByRole('button', { name: 'gal/°F' }));

    expect(screen.queryByText('40 L')).toBeNull();
    expect(screen.getByText('Betta Cube').closest('button')?.textContent).toContain('5 gal');
    expect(screen.getAllByText(/°F/).length).toBeGreaterThan(0);
  });

  it('derives the consequences of the environment from the engine', () => {
    renderSection(stubSim(planted));

    // 40 L on a canister: 320 L/h ÷ 40 L, under the 4500 L/h cap.
    expect(screen.getByText('8.0 × tank volume/h')).toBeTruthy();
    expect(screen.getByText('Bacteria surface')).toBeTruthy();
    expect(screen.getByText('Plant slots')).toBeTruthy();
  });

  it('quotes the turnover the filter can actually reach, not its target', () => {
    const sponge = {
      ...planted,
      tank: { ...planted.tank, capacity: 150 },
      resources: { ...planted.resources, water: 150 },
      equipment: { ...planted.equipment, filter: { enabled: true, type: 'sponge' as const } },
    };
    renderSection(stubSim(sponge));

    // 150 L × 4 = 600 L/h, capped at the sponge's 300 L/h.
    expect(screen.getByText('2.0 × tank volume/h')).toBeTruthy();
  });

  /**
   * The rail exists so the reader need not open the section; Scenario's row and
   * its header read one derivation, so they cannot name different tanks.
   */
  it('names the preset and its tank exactly as the rail row does', () => {
    renderSection(stubSim(planted));

    const rail = navFigures({
      state: planted,
      config: DEFAULT_CONFIG,
      aggregates: emptyAggregates(),
      runLogs: planted.logs,
      presetName: 'Planted Tank',
      presetModified: false,
      units: 'metric',
    }).scenario;

    const header = screen.getByRole('heading', { level: 1, name: 'Scenario' }).parentElement!;
    expect(within(header).getByText(scenarioSummary(planted, 'Planted Tank', 'metric'))).toBeTruthy();
    expect(rail.lines[0]).toBe('Planted Tank · 40 L');
  });

  it('stands the preset column beside the environment column', () => {
    renderSection(stubSim(planted));
    const presets = screen.getByText('Preset').closest('section')!;
    const environment = screen.getByText('Environment').closest('section')!;

    expect(presets).not.toBe(environment);
    expect(presets.parentElement).toBe(environment.parentElement);
    expect(within(presets).getByText('Betta Cube')).toBeTruthy();
    expect(within(environment).getByText('Derived')).toBeTruthy();
  });

  /** The footer is a band, not a row: it wraps rather than truncating the cost. */
  it('keeps reset, duplicate and the consequence together below the body', () => {
    renderSection(stubSim(planted));
    const band = screen.getByRole('button', { name: /Reset run/ }).parentElement!;

    expect(within(band).getByRole('button', { name: /Duplicate scenario/ })).toBeTruthy();
    expect(within(band).getByText(/Reset clears the clock/)).toBeTruthy();
    // Outside the scrolling body, so the cost is on screen wherever the body is.
    expect(band.parentElement).toBe(screen.getByRole('main'));
  });

  it('offers the lids in the one wording the rail and the cards use', () => {
    renderSection(stubSim(planted));
    const lid = screen.getByRole('combobox', { name: 'Lid type' });
    expect([...lid.querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      'no lid',
      'mesh lid',
      'full lid',
      'sealed lid',
    ]);
  });
});
