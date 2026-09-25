import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { GearSection } from './GearSection';
import { UnitsProvider } from '../hooks/useUnits';
import { PersistenceProvider } from '../persistence/index.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import {
  createHardscapeItem,
  createSimulation,
  LIGHT_PAR_OPTIONS,
  type SimulationState,
} from '../../simulation/index.js';
import { scheduleHours } from '../build';
import type { useSimulation } from '../hooks/useSimulation';
import { stubMatchMedia, viewport, type MatchMediaStub } from '../test/matchMedia';
import { StageOutlet } from '../test/stage';
import { stubSim } from '../test/stubSim';

let media: MatchMediaStub;

beforeEach(() => {
  media = stubMatchMedia(viewport(1180));
});

afterEach(() => {
  media.restore();
  globalThis.localStorage.clear();
  cleanup();
});

const base: SimulationState = createSimulation({ tankCapacity: 40 });

function Address(): React.JSX.Element {
  return <span data-testid="address">{useLocation().pathname}</span>;
}

function Elsewhere(): React.JSX.Element {
  return <Link to="/gear/light">the Light row</Link>;
}

function Back(): React.JSX.Element {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(-1)}>
      back
    </button>
  );
}

function renderGear(
  path = '/gear',
  sim: ReturnType<typeof useSimulation> = stubSim(base)
): ReturnType<typeof useSimulation> {
  render(
    <PersistenceProvider>
      <UnitsProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={<StageOutlet />}>
              <Route path="/" element={<Elsewhere />} />
              <Route
                path="/gear/:deviceId?"
                element={<GearSection sim={sim} config={DEFAULT_CONFIG} />}
              />
            </Route>
          </Routes>
          <Address />
          <Back />
        </MemoryRouter>
      </UnitsProvider>
    </PersistenceProvider>
  );
  return sim;
}

function address(): string {
  return screen.getByTestId('address').textContent ?? '';
}

function rackRows(): string[] {
  return screen
    .getAllByRole('link')
    .map((link) => link.getAttribute('aria-label') ?? '')
    .filter((label) => label.includes(' — '));
}

function rowNamed(name: string): HTMLElement {
  return screen.getByRole('group', { name });
}

describe('GearSection', () => {
  it('racks the eight devices, and nothing the engine cannot install', () => {
    renderGear();
    expect(rackRows().map((label) => label.split(' — ')[0])).toEqual([
      'Filter',
      'Heater',
      'Light',
      'Air pump',
      'ATO',
      'CO₂ injector',
      'Powerhead',
      'Auto doser',
    ]);
  });

  it('carries the day inline for a device that keeps one, and the setting for one that does not', () => {
    renderGear();

    expect(
      within(rowNamed('Light')).getByText(scheduleHours(base.equipment.light.schedule))
    ).toBeTruthy();
    expect(within(rowNamed('Filter')).getByText(/^sponge · /)).toBeTruthy();
    expect(within(rowNamed('CO₂ injector')).getByText('off')).toBeTruthy();
  });

  it('switches a device from its row', () => {
    const sim = renderGear();

    fireEvent.click(screen.getByRole('switch', { name: 'Heater power' }));
    expect(sim.updateHeaterEnabled).toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByRole('switch', { name: 'Powerhead power' }));
    expect(sim.updatePowerheadEnabled).toHaveBeenCalledWith(true);
  });

  it('opens the inspector the address names, and closes it back to the rack', () => {
    renderGear('/gear/light');
    const drawer = screen.getByRole('dialog', { name: 'Light' });

    expect(within(drawer).getByRole('combobox', { name: 'Light output' })).toBeTruthy();

    fireEvent.click(within(drawer).getByRole('button', { name: 'Close Light' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(address()).toBe('/gear');
  });

  it('swaps the open inspector for the row that was clicked, one entry deeper', () => {
    renderGear('/gear/light');
    const filter = screen.getByRole('link', { name: /^Filter —/ });

    fireEvent.pointerDown(filter);
    fireEvent.click(filter);

    expect(screen.getByRole('dialog', { name: 'Filter' })).toBeTruthy();
    expect(address()).toBe('/gear/filter');

    fireEvent.click(screen.getByRole('button', { name: 'back' }));

    expect(address()).toBe('/gear/light');
    expect(screen.getByRole('dialog', { name: 'Light' })).toBeTruthy();
  });

  it('closes onto the rack, not back out of Gear', () => {
    renderGear('/');

    fireEvent.click(screen.getByRole('link', { name: 'the Light row' }));
    expect(screen.getByRole('dialog', { name: 'Light' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Close Light' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(address()).toBe('/gear');
  });

  it('leaves the inspector open when a switch behind it is flipped', () => {
    const sim = renderGear('/gear/light');
    const heater = screen.getByRole('switch', { name: 'Heater power' });

    fireEvent.pointerDown(heater);
    fireEvent.click(heater);

    expect(sim.updateHeaterEnabled).toHaveBeenCalledWith(false);
    expect(screen.getByRole('dialog', { name: 'Light' })).toBeTruthy();
  });

  it('states the inspector’s power once, on the switch', () => {
    renderGear('/gear/light');
    const drawer = within(screen.getByRole('dialog', { name: 'Light' }));

    expect(drawer.getByRole('switch', { name: 'Light power' }).getAttribute('aria-checked')).toBe(
      'true'
    );
    expect(drawer.queryByText('on', { ignore: '[aria-hidden="true"]' })).toBeNull();
  });

  it('sends a device the engine does not configure back to the rack', () => {
    renderGear('/gear/biofilter');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(address()).toBe('/gear');
  });

  it('dispatches a setting from the inspector', () => {
    const sim = renderGear('/gear/light');
    const drawer = within(screen.getByRole('dialog', { name: 'Light' }));

    const par = LIGHT_PAR_OPTIONS.find((option) => option !== base.equipment.light.par)!;
    fireEvent.change(drawer.getByRole('combobox', { name: 'Light output' }), {
      target: { value: String(par) },
    });
    expect(sim.updateLightPar).toHaveBeenCalledWith(par);
  });

  it('edits a schedule on the ends it is stated by, and stores the span between them', () => {
    const sim = renderGear('/gear/light');
    const { schedule } = base.equipment.light;

    fireEvent.click(
      within(screen.getByRole('group', { name: 'End hour' })).getByRole('button', {
        name: 'increase',
      })
    );

    expect(sim.updateLightSchedule).toHaveBeenCalledWith({
      startHour: schedule.startHour,
      duration: schedule.duration + 1,
    });
  });

  it('reads what the fittings add up to, which is what the tick reads', () => {
    renderGear();
    const summed = screen.getByRole('heading', { level: 2, name: 'What the tank gets' })
      .parentElement!.parentElement!;

    for (const name of ['Bacteria surface', 'Circulation', 'PAR at substrate', 'Aeration']) {
      expect(within(summed).getByText(name)).toBeTruthy();
    }
  });
});

describe('GearSection — the scape', () => {
  it('adds a piece through the menu that offers it', () => {
    const sim = renderGear();

    fireEvent.click(screen.getByRole('button', { name: '+ Hardscape' }));
    fireEvent.click(screen.getByRole('button', { name: '+ Driftwood' }));

    expect(sim.addHardscapeItem).toHaveBeenCalledWith('driftwood');
  });

  it('opens the menu on a direct load of the address the palette hands out', () => {
    renderGear('/gear?add=hardscape');

    expect(screen.getByRole('button', { name: '+ Driftwood' })).toBeTruthy();
  });

  it('refuses a piece past the ceiling, in the engine’s words', () => {
    const full: SimulationState = {
      ...base,
      equipment: {
        ...base.equipment,
        hardscape: {
          items: Array.from({ length: base.tank.hardscapeSlots }, (_, i) =>
            createHardscapeItem(`hardscape_${i}`, 'neutral_rock')
          ),
        },
      },
    };
    renderGear('/gear', stubSim(full));

    expect(screen.queryByRole('button', { name: '+ Hardscape' })).toBeNull();
    expect(
      screen.getByText(`Tank at hardscape capacity (${base.tank.hardscapeSlots} slots max)`)
    ).toBeTruthy();
  });

  it('removes a piece by the row it sits on', () => {
    const scaped: SimulationState = {
      ...base,
      equipment: {
        ...base.equipment,
        hardscape: { items: [createHardscapeItem('hardscape_1', 'driftwood')] },
      },
    };
    const sim = renderGear('/gear', stubSim(scaped));

    fireEvent.click(screen.getByRole('button', { name: 'Remove Driftwood' }));

    expect(sim.removeHardscapeItem).toHaveBeenCalledWith('hardscape_1');
  });
});
