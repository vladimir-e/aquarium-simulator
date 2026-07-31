import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { IndexRail } from './IndexRail';
import { UnitsProvider } from '../../hooks/useUnits';
import { PersistenceProvider } from '../../persistence/index.js';
import { navFigures, SECTIONS, type NavFigure, type SectionId } from '../../nav';
import { buildDeviceList } from '../../build';
import { DEFAULT_CONFIG } from '../../../simulation/config/index.js';
import { applyAction, createSimulation, type SimulationState } from '../../../simulation/index.js';

afterEach(() => {
  globalThis.localStorage.clear();
  cleanup();
});

function figuresFor(state: SimulationState): Record<SectionId, NavFigure> {
  return navFigures({
    state,
    config: DEFAULT_CONFIG,
    presetName: 'Planted Tank',
    presetModified: false,
    units: 'metric',
    aggregates: { ticks: 1622, deaths: 2, births: 18, frySold: 0, alerts: 6, waterChangedL: 340 },
    runLogs: state.logs,
  });
}

function renderRail(
  state: SimulationState = createSimulation({ tankCapacity: 200 }),
  path = '/',
  footer?: React.ReactNode
): { onNavigate: ReturnType<typeof vi.fn> } {
  const onNavigate = vi.fn();
  render(
    <PersistenceProvider>
      <UnitsProvider>
        <MemoryRouter initialEntries={[path]}>
          <IndexRail
            figures={figuresFor(state)}
            tick={state.tick}
            isPlaying={false}
            speed="1h"
            lightSchedule={{ startHour: 8, duration: 10 }}
            lightOn
            onPlayPause={vi.fn()}
            onStep={vi.fn()}
            onSpeedChange={vi.fn()}
            onNavigate={onNavigate}
            footer={footer}
          />
        </MemoryRouter>
      </UnitsProvider>
    </PersistenceProvider>
  );
  return { onNavigate };
}

function row(label: string): HTMLElement {
  return screen.getByRole('link', { name: new RegExp(label) });
}

describe('IndexRail', () => {
  it('lists all six sections as links', () => {
    renderRail();
    const links = within(screen.getByRole('navigation', { name: 'Sections' })).getAllByRole('link');
    expect(links).toHaveLength(SECTIONS.length);
  });

  it('prints each section’s live figure on its row, not behind a visit', () => {
    let state = createSimulation({ tankCapacity: 200 });
    state = applyAction(state, { type: 'addFish', species: 'neon_tetra' }).state;

    renderRail(state);

    expect(row('Equipment').textContent).toContain('biofilter 0 %');
    expect(row('Livestock').textContent).toContain('1 fish');
    expect(row('Livestock').textContent).toContain('bioload');
    expect(row('Scenario').textContent).toContain('Planted Tank · 200 L');
  });

  it('shows a device dot per device, filled for the ones that are on', () => {
    const state = createSimulation({ tankCapacity: 200 });
    const devices = buildDeviceList(state.equipment);

    renderRail(state);

    const dots = Array.from(row('Equipment').querySelectorAll('span.rounded-full'));
    expect(dots).toHaveLength(devices.length);
    expect(dots.filter((d) => d.className.includes('bg-ok'))).toHaveLength(
      devices.filter((d) => d.on).length
    );
  });

  it('colours a micro-meter by its status, and leaves quiet readings quiet', () => {
    const state = createSimulation({ tankCapacity: 200 });
    state.resources.ammonia = state.resources.water * 2; // 2 ppm — past the alert line

    renderRail(state);

    const fills = Array.from(row('Water').querySelectorAll('[class*="rounded-b-badge"]')).map(
      (el) => el.className
    );
    // Ordered temp · pH · lvl · NH₃ · NO₂ · NO₃; only ammonia is in alert.
    expect(fills).toHaveLength(6);
    expect(fills[3]).toContain('bg-alert');
    expect(fills[0]).toContain('bg-ink-3');
  });

  it('carries the Water row’s pill', () => {
    renderRail();
    expect(row('Water').textContent).toContain('uncycled');
  });

  it('dismisses the drawer when a row is followed', () => {
    const { onNavigate } = renderRail();
    fireEvent.click(row('Flora'));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('docks whatever the shell puts at its foot, below the index', () => {
    renderRail(createSimulation({ tankCapacity: 200 }), '/', <button type="button">Actions</button>);

    const foot = screen.getByRole('button', { name: 'Actions' });
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    expect(nav.parentElement?.lastElementChild).toBe(foot);
  });
});
