import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, cleanup, fireEvent, within } from '@testing-library/react';
import { OverviewSection } from './OverviewSection';
import { activeNeeds } from '../nav';
import { readTank } from '../readings';
import { bare, stocked, type Run } from '../test/run';
import { query, renderStage } from '../test/stage';
import { stubSim } from '../test/stubSim';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import {
  applyAction,
  createSimulation,
  MAX_DOSE_ML,
  MAX_ROOT_TABS,
  type AlertState,
  type SimulationState,
} from '../../simulation/index.js';
import { bedReading, doseToCover, nutrientReadings } from '../run';
import type { useSimulation } from '../hooks/useSimulation';

afterEach(cleanup);

function renderOverview(
  run: Run = bare(),
  flags: Partial<AlertState> = {},
  onAct = vi.fn()
): ReturnType<typeof useSimulation> {
  const state = { ...run.state, alertState: { ...run.state.alertState, ...flags } };
  const sim = stubSim(state, run.history);

  const book = readTank({ state, config: DEFAULT_CONFIG, history: run.history, units: 'metric' });
  renderStage(<OverviewSection sim={sim} config={DEFAULT_CONFIG} />, {
    needs: activeNeeds(state, book),
    onAct,
  });
  return sim;
}

const DEVICES = [
  'filter',
  'heater',
  'light',
  'airPump',
  'ato',
  'co2Generator',
  'powerhead',
  'autoDoser',
] as const;

const NAMES: Record<(typeof DEVICES)[number], string> = {
  filter: 'Filter power',
  heater: 'Heater power',
  light: 'Light power',
  airPump: 'Air pump power',
  ato: 'ATO power',
  co2Generator: 'CO₂ injector power',
  powerhead: 'Powerhead power',
  autoDoser: 'Auto doser power',
};

function strip(): HTMLElement | null {
  return screen.queryByRole('region', { name: 'Needs you' });
}

function widget(title: string): HTMLElement {
  return screen.getByRole('link', { name: `${title} module` }).closest('section')!;
}

describe('OverviewSection', () => {
  it('says nothing above the grid when the engine has latched nothing', () => {
    renderOverview();
    expect(strip()).toBeNull();
  });

  it('names what is latched, in the tone its own reading carries, with the verb that answers it', () => {
    const fouled = bare();
    fouled.state = {
      ...fouled.state,
      resources: { ...fouled.state.resources, ammonia: 5 * fouled.state.resources.water },
    };
    renderOverview(fouled, { highAmmonia: true, highNitrate: true });

    expect(screen.getByText('NH₃ high').className).toContain('text-alert');
    expect(screen.getByText('NO₃ high').className).toContain('text-warn');
    expect(within(strip()!).getAllByRole('button', { name: /Water change/ })).toHaveLength(2);
  });

  it('opens the verb that answers a need, rather than routing to the module', () => {
    const onAct = vi.fn();
    const coated = createSimulation({ tankCapacity: 200 });
    coated.algae.film.mass = 40;
    renderOverview(bare(coated), { highAlgae: true }, onAct);

    fireEvent.click(within(strip()!).getByRole('button', { name: /Scrub/ }));
    expect(onAct).toHaveBeenCalledWith('scrubAlgae');
  });

  it('answers a bloom need for the kind that covers more: green water with a water change', () => {
    const onAct = vi.fn();
    const green = createSimulation({ tankCapacity: 200 });
    Object.assign(green.algae, { greenWater: { ...green.algae.greenWater, mass: 40 }, film: { ...green.algae.film, mass: 10 } });
    renderOverview(bare(green), { highAlgae: true }, onAct);

    fireEvent.click(within(strip()!).getByRole('button', { name: /Water change/ }));
    expect(onAct).toHaveBeenCalledWith('waterChange');
  });

  it('routes a need no husbandry verb answers into the module that owns the gear', () => {
    renderOverview(bare(), { lowOxygen: true });

    expect(within(strip()!).getByRole('link', { name: /Air pump/ }).getAttribute('href')).toBe(
      '/gear'
    );
  });

  it('drops the strip again once the tank recovers', () => {
    renderOverview(bare(), { highAmmonia: true });
    expect(strip()).toBeTruthy();

    cleanup();
    renderOverview();
    expect(strip()).toBeNull();
  });

  it('runs the cycle, the roster and the rack across a tablet, the two reading sheets side by side', () => {
    renderOverview();

    for (const title of ['Nitrogen', 'Life', 'Gear']) {
      expect(widget(title).className).toContain('md:col-span-2');
    }
    for (const title of ['Water', 'Nutrients']) {
      expect(widget(title).className).not.toContain('col-span');
    }
  });

  it('draws the cycle as a chain of four stocks', () => {
    renderOverview(stocked());
    const nitrogen = within(widget('Nitrogen'));

    for (const stock of ['Waste', 'NH₃', 'NO₂', 'NO₃']) {
      expect(nitrogen.getByRole('button', { name: new RegExp(stock) })).toBeTruthy();
    }
    expect(nitrogen.getByText('AOB')).toBeTruthy();
    expect(nitrogen.getByText('NOB')).toBeTruthy();
  });

  it('opens a stock in the reading drawer, and closes it again', () => {
    renderOverview(stocked());

    fireEvent.click(within(widget('Nitrogen')).getByRole('button', { name: /NO₂/ }));
    const drawer = screen.getByRole('dialog', { name: 'NO₂' });
    expect(within(drawer).getByText(/Safe at or under/)).toBeTruthy();

    fireEvent.click(within(drawer).getByRole('button', { name: 'Close NO₂' }));
    expect(screen.queryByRole('dialog', { name: 'NO₂' })).toBeNull();
  });

  it('draws no chart for a reading the buffer never recorded', () => {
    renderOverview(stocked());

    fireEvent.click(within(widget('Nitrogen')).getByRole('button', { name: /Waste/ }));
    const waste = within(screen.getByRole('dialog', { name: 'Waste' }));
    expect(waste.getByText(/A pool with no safe line/)).toBeTruthy();
    expect(waste.getByText('What fills it')).toBeTruthy();
    expect(waste.queryByText(/days|d so far/)).toBeNull();

    fireEvent.click(waste.getByRole('button', { name: 'Close Waste' }));
    fireEvent.click(within(widget('Nitrogen')).getByRole('button', { name: /NO₂/ }));
    expect(within(screen.getByRole('dialog')).getByText(/days|d so far/)).toBeTruthy();
  });

  it('bands temperature on what is stocked, and leaves it unbanded when nothing is', () => {
    renderOverview(stocked());
    fireEvent.click(within(widget('Water')).getByRole('button', { name: /Temp/ }));
    expect(
      within(screen.getByRole('dialog')).getByText(/the span every stocked species tolerates/)
    ).toBeTruthy();

    cleanup();
    renderOverview(bare());
    fireEvent.click(within(widget('Water')).getByRole('button', { name: /Temp/ }));
    expect(
      within(screen.getByRole('dialog')).getByText(/Nothing stocked, so nothing/)
    ).toBeTruthy();
  });

  it('lists a species once, with a dot for every fish in it', () => {
    renderOverview(stocked());
    const life = within(widget('Life'));

    expect(life.getAllByText(/Neon/i)).toHaveLength(1);
    expect(life.getByRole('img', { name: /Neon.* by individual/i }).children).toHaveLength(6);
  });

  it('lists a plant species once, with a dot for every family it was planted as', () => {
    renderOverview(stocked());
    const life = within(widget('Life'));

    expect(life.getByText('×2')).toBeTruthy();
    expect(life.getByRole('img', { name: /Anubias by family/i }).children).toHaveLength(2);
  });

  it('opens a group on the member it names, in the Life ledger', () => {
    renderOverview(stocked());
    fireEvent.click(
      within(widget('Life')).getByRole('button', { name: /Neon Tetra — inspect the worst of 6/ })
    );

    expect(query().get('inspect')).toBe('species-neon_tetra');
  });

  it('opens the add menu in place, and lands on the picker it names', () => {
    renderOverview(stocked());
    const life = within(widget('Life'));

    fireEvent.click(life.getByRole('button', { name: '+ Add' }));
    fireEvent.click(life.getByRole('button', { name: 'Add fish' }));

    expect(query().get('add')).toBe('fish');
  });

  it('gives the bloom rows no dots to speak of', () => {
    renderOverview(stocked());
    expect(within(widget('Life')).queryByRole('img', { name: /Green water|Film algae/i })).toBeNull();
  });

  it('invites stocking when the tank is bare', () => {
    renderOverview(bare());
    expect(within(widget('Life')).getByText(/Nothing stocked yet/)).toBeTruthy();
  });

  it('collapses every device that is off into one row, and powers one that is on', () => {
    const run = stocked();
    const sim = renderOverview(run);
    const gear = within(widget('Gear'));
    const off = DEVICES.filter((id) => !run.state.equipment[id].enabled);

    expect(gear.getByText('Off')).toBeTruthy();
    expect(gear.getAllByRole('switch')).toHaveLength(DEVICES.length - off.length);
    for (const id of off) expect(gear.queryByRole('switch', { name: NAMES[id] })).toBeNull();

    fireEvent.click(gear.getByRole('switch', { name: 'Filter power' }));
    expect(sim.updateFilterEnabled).toHaveBeenCalledWith(false);
  });

  it('opens the day’s light on the Gear widget in the reading drawer', () => {
    renderOverview(stocked());

    fireEvent.click(within(widget('Gear')).getByRole('button', { name: /daily light/ }));
    expect(screen.getByRole('dialog', { name: 'Daily light' })).toBeTruthy();
  });

  it('reads the plant foods against what the plants ask for', () => {
    const run = stocked();
    const asked = nutrientReadings(run.state, DEFAULT_CONFIG).filter((reading) => reading.needed > 0);
    renderOverview(run);
    const nutrients = within(widget('Nutrients'));

    expect(asked.length).toBeGreaterThan(0);
    expect(nutrients.getAllByText(/^need /)).toHaveLength(asked.length);
    expect(nutrients.getByText(/1 ml moves/)).toBeTruthy();
  });

  it('says nothing is asking for the nutrients when nothing is planted', () => {
    renderOverview(bare());
    const nutrients = within(widget('Nutrients'));

    expect(nutrients.getByText('no plants to feed')).toBeTruthy();
    expect(nutrients.queryByText(/^need /)).toBeNull();
  });

  it('offers the dose a big tank asks for only as far as one dose goes', () => {
    const state = applyAction(createSimulation({ tankCapacity: 1000 }), { type: 'addPlant', species: 'monte_carlo' }).state;
    expect(doseToCover(nutrientReadings(state, DEFAULT_CONFIG), state, DEFAULT_CONFIG)!.ml).toBeGreaterThan(MAX_DOSE_ML);
    const onAct = vi.fn();
    renderOverview(bare(state), {}, onAct);

    fireEvent.click(within(widget('Nutrients')).getByRole('button', { name: `Dose · ${MAX_DOSE_ML} ml` }));
    expect(onAct).toHaveBeenCalledWith('dose', MAX_DOSE_ML);
  });

  describe('a sword’s bed', () => {
    const sword = (tank: Parameters<typeof createSimulation>[0]): SimulationState =>
      applyAction(createSimulation(tank), { type: 'addPlant', species: 'amazon_sword' }).state;

    it('offers the tabs a big bed asks for only as far as one push goes', () => {
      const state = sword({ tankCapacity: 1000, substrate: { type: 'gravel' } });
      expect(bedReading(state, DEFAULT_CONFIG).advice).toBeGreaterThan(MAX_ROOT_TABS);
      const onAct = vi.fn();
      renderOverview(bare(state), {}, onAct);

      fireEvent.click(within(widget('Nutrients')).getByRole('button', { name: `Root tab · ${MAX_ROOT_TABS} tabs` }));
      expect(onAct).toHaveBeenCalledWith('rootTab', MAX_ROOT_TABS);
    });

    it('reads roots starving over a bare bottom, and offers no tab to push', () => {
      renderOverview(bare(sword({ tankCapacity: 200 })));
      const nutrients = within(widget('Nutrients'));

      expect(nutrients.getByText(/no bed$/)).toBeTruthy();
      expect(nutrients.getByRole('button', { name: /^Bed / })).toBeTruthy();
      expect(nutrients.queryByRole('button', { name: /^Root tab/ })).toBeNull();
    });
  });
});
