import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { TunablesDrawer } from './TunablesDrawer';
import { ConfigProvider, useConfig } from '../../hooks/useConfig';
import { PersistenceProvider } from '../../persistence/index.js';
import { configRange, countModified, DEFAULT_CONFIG } from '../../../simulation/config/index.js';
import { stubMatchMedia, viewport, type MatchMediaStub } from '../../test/matchMedia';

let media: MatchMediaStub;

beforeEach(() => {
  globalThis.localStorage.clear();
  media = stubMatchMedia(viewport(1180));
});

afterEach(() => {
  media.restore();
  cleanup();
  globalThis.localStorage.clear();
});

function Badge(): React.JSX.Element {
  const { config } = useConfig();
  return <output data-testid="badge">{countModified(config)}</output>;
}

function openDrawer(): void {
  render(
    <PersistenceProvider>
      <ConfigProvider>
        <Badge />
        <TunablesDrawer open onClose={() => {}} />
      </ConfigProvider>
    </PersistenceProvider>
  );
}

const badge = (): string => screen.getByTestId('badge').textContent ?? '';

function section(name: string): HTMLElement {
  return screen.getByRole('heading', { level: 3, name }).closest('section')!;
}

function expand(name: string): HTMLElement {
  fireEvent.click(screen.getByRole('heading', { level: 3, name }));
  return section(name);
}

function search(term: string): void {
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search constants' }), {
    target: { value: term },
  });
}

describe('TunablesDrawer', () => {
  it('lists every config section, livestock included', () => {
    openDrawer();
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);

    expect(headings).toHaveLength(Object.keys(DEFAULT_CONFIG).length);
    expect(headings).toContain('Livestock');
  });

  it('filters to the fields a search term names, wherever they live', () => {
    openDrawer();
    search('attenuation');

    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(['Water optics']);
    expect(screen.getByLabelText(/Water Attenuation/)).toBeTruthy();
    expect(screen.queryByLabelText(/Q10/)).toBeNull();
  });

  it('says so rather than emptying when nothing is called that', () => {
    openDrawer();
    search('zzz');

    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0);
    expect(screen.getByText('No constant is called that.')).toBeTruthy();
  });

  it('edits a nested formula the section list cannot address, and marks it', () => {
    openDrawer();
    const nutrients = expand('Nutrients');
    const iron = within(nutrients).getByLabelText('Iron per ml');

    fireEvent.change(iron, { target: { value: '0.5' } });

    expect(badge()).toBe('1');
    expect(within(nutrients).getByText('Fertiliser formula')).toBeTruthy();
    expect(within(nutrients).getByRole('button', { name: 'Reset' })).toBeTruthy();
  });

  it('holds a field to the range its tunable declares, settling on blur', () => {
    openDrawer();
    const optics = expand('Water optics');
    const input = within(optics).getByLabelText(/Water Attenuation/);

    fireEvent.change(input, { target: { value: '-100' } });
    expect(badge()).toBe('0');

    fireEvent.blur(input);
    const { min } = configRange('optics.waterAttenuationPerCm')!;
    expect((input as globalThis.HTMLInputElement).value).toBe(String(min));
    expect(badge()).toBe('1');
  });

  it('counts what it has moved, section by section and in the badge', () => {
    openDrawer();
    const decay = expand('Decay');

    fireEvent.change(within(decay).getByLabelText('Q10 Temperature Coefficient'), {
      target: { value: '2.5' },
    });
    fireEvent.change(within(decay).getByLabelText('Reference Temperature'), {
      target: { value: '24' },
    });

    expect(within(decay).getByRole('button', { name: /Decay/ }).textContent).toContain('2');
    expect(badge()).toBe('2');
  });

  it('resets one section without touching another, and all of them at once', () => {
    openDrawer();
    const decay = expand('Decay');
    fireEvent.change(within(decay).getByLabelText('Q10 Temperature Coefficient'), {
      target: { value: '2.5' },
    });
    const plants = expand('Plants');
    fireEvent.change(within(plants).getAllByRole('spinbutton')[0], { target: { value: '0.2' } });
    expect(badge()).toBe('2');

    fireEvent.click(within(section('Decay')).getByRole('button', { name: 'Reset' }));
    expect(badge()).toBe('1');

    fireEvent.click(screen.getByRole('button', { name: 'Reset all' }));
    expect(badge()).toBe('0');
    expect(screen.queryByRole('button', { name: 'Reset all' })).toBeNull();
  });

  it('opens on whatever is already off stock, and leaves the rest folded', () => {
    render(
      <PersistenceProvider>
        <ConfigProvider>
          <Tuned />
        </ConfigProvider>
      </PersistenceProvider>
    );

    expect(within(section('Decay')).getByLabelText('Q10 Temperature Coefficient')).toBeTruthy();
    expect(within(section('Plants')).queryByRole('spinbutton')).toBeNull();
  });
});

function Tuned(): React.JSX.Element | null {
  const { setTunable } = useConfig();
  const [tuned, setTuned] = React.useState(false);

  React.useEffect(() => {
    setTunable('decay.q10', 2.5);
    setTuned(true);
  }, [setTunable]);

  return tuned ? <TunablesDrawer open onClose={() => {}} /> : null;
}
