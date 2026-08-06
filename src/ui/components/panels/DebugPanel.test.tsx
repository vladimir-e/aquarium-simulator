import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React, { useEffect } from 'react';
import { DebugPanel } from './DebugPanel.js';
import { ConfigProvider, useConfig } from '../../hooks/useConfig.js';
import { PersistenceProvider } from '../../persistence/index.js';
import { DEFAULT_CONFIG } from '../../../simulation/config/index.js';

function Harness(): React.JSX.Element {
  const { config, setDebugPanelOpen } = useConfig();
  useEffect(() => {
    setDebugPanelOpen(true);
  }, [setDebugPanelOpen]);
  return (
    <>
      <DebugPanel />
      <output data-testid="attenuation">{config.optics.waterAttenuationPerCm}</output>
      <output data-testid="bacteriaPerCm2">{config.nitrogenCycle.bacteriaPerCm2}</output>
    </>
  );
}

function openPanel(section: string): void {
  render(
    <PersistenceProvider>
      <ConfigProvider>
        <Harness />
      </ConfigProvider>
    </PersistenceProvider>
  );
  fireEvent.click(screen.getByText(section));
}

const attenuation = (): string => screen.getByTestId('attenuation').textContent ?? '';

beforeEach(() => globalThis.localStorage.clear());
afterEach(() => {
  cleanup();
  globalThis.localStorage.clear();
});

describe('DebugPanel', () => {
  it('holds a tunable to the range its meta declares', () => {
    openPanel('Water Optics');
    const input = screen.getByLabelText(/Water Attenuation/);

    fireEvent.change(input, { target: { value: '-100' } });
    expect(attenuation()).toBe(String(DEFAULT_CONFIG.optics.waterAttenuationPerCm));

    fireEvent.blur(input);
    expect(attenuation()).toBe('0.001');
  });

  it('settles a value above the range down onto it', () => {
    openPanel('Water Optics');
    const input = screen.getByLabelText(/Water Attenuation/);

    fireEvent.change(input, { target: { value: '5' } });
    expect(attenuation()).toBe(String(DEFAULT_CONFIG.optics.waterAttenuationPerCm));

    fireEvent.blur(input);
    expect(attenuation()).toBe('0.05');
  });

  it('takes a value inside the range as it is typed', () => {
    openPanel('Water Optics');
    fireEvent.change(screen.getByLabelText(/Water Attenuation/), { target: { value: '0.02' } });
    expect(attenuation()).toBe('0.02');
  });

  // The nitrogen cycle declares no range, so the finite check is the only
  // thing between `1e999` and an engine that multiplies by it.
  it('refuses a non-finite value where no range is declared', () => {
    openPanel('Nitrogen Cycle');
    const input = screen.getByLabelText(/Max Bacteria per cm/);
    const before = String(DEFAULT_CONFIG.nitrogenCycle.bacteriaPerCm2);

    fireEvent.change(input, { target: { value: '1e999' } });
    expect(screen.getByTestId('bacteriaPerCm2').textContent).toBe(before);

    fireEvent.blur(input);
    expect(screen.getByTestId('bacteriaPerCm2').textContent).toBe(before);
  });

  it('takes any finite number where no range is declared', () => {
    openPanel('Nitrogen Cycle');
    fireEvent.change(screen.getByLabelText(/Max Bacteria per cm/), { target: { value: '260' } });
    expect(screen.getByTestId('bacteriaPerCm2').textContent).toBe('260');
  });

  it('shows the range on the control itself', () => {
    openPanel('Water Optics');
    const bounded = screen.getByLabelText(/Water Attenuation/);
    expect(bounded).toHaveProperty('min', '0.001');
    expect(bounded).toHaveProperty('max', '0.05');

    fireEvent.click(screen.getByText('Nitrogen Cycle'));
    const unbounded = screen.getByLabelText(/Max Bacteria per cm/);
    expect(unbounded).toHaveProperty('min', '');
    expect(unbounded).toHaveProperty('max', '');
  });
});
