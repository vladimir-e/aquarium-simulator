import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { EquipmentColumn } from './EquipmentColumn';
import { createSimulation, type SimulationState } from '../../../simulation/index.js';
import type { useSimulation } from '../../hooks/useSimulation';
import { UnitsProvider } from '../../hooks/useUnits';
import { PersistenceProvider } from '../../persistence/index.js';

const base: SimulationState = createSimulation({ tankCapacity: 40 });

function stubSim(state: SimulationState): ReturnType<typeof useSimulation> {
  const cache = new Map<string, ReturnType<typeof vi.fn>>();
  return new Proxy(
    { state },
    {
      get(target: { state: SimulationState }, prop: string): unknown {
        if (prop === 'state') return target.state;
        if (!cache.has(prop)) cache.set(prop, vi.fn());
        return cache.get(prop);
      },
    }
  ) as unknown as ReturnType<typeof useSimulation>;
}

function renderColumn(selectedDeviceId: string | null = null): void {
  render(
    <PersistenceProvider>
      <UnitsProvider>
        <EquipmentColumn sim={stubSim(base)} selectedDeviceId={selectedDeviceId} />
      </UnitsProvider>
    </PersistenceProvider>
  );
}

function mobileMediaQueryList(query: string): ReturnType<typeof globalThis.matchMedia> {
  const noop = (): void => {};
  return {
    matches: true, // force the mobile layout
    media: query,
    onchange: null,
    addEventListener: noop,
    removeEventListener: noop,
    addListener: noop,
    removeListener: noop,
    dispatchEvent: (): boolean => false,
  } as unknown as ReturnType<typeof globalThis.matchMedia>;
}

let restoreMatchMedia: () => void;

beforeEach(() => {
  globalThis.localStorage.clear();
  const original = globalThis.matchMedia;
  globalThis.matchMedia = mobileMediaQueryList;
  restoreMatchMedia = (): void => {
    globalThis.matchMedia = original;
  };
});

afterEach(() => {
  restoreMatchMedia();
  cleanup();
});

describe('EquipmentColumn (mobile)', () => {
  it('pushes a full-screen editor when a device row is tapped, and pops it on back', () => {
    renderColumn();
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Heater/ }));
    const dialog = screen.getByRole('dialog', { name: /Heater/ });
    expect(within(dialog).getByText('Target')).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: /back/i }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens straight into the editor for a device carried in from Run', () => {
    renderColumn('co2Generator');
    const dialog = screen.getByRole('dialog', { name: /CO₂ injector/ });
    expect(within(dialog).getByText('Bubble rate')).toBeTruthy();
  });
});
