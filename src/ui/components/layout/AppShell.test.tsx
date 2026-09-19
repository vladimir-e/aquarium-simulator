import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './AppShell';
import { ModulePage } from './ModulePage';
import { ThemeProvider } from '../../hooks/useTheme';
import { UnitsProvider } from '../../hooks/useUnits';
import { ConfigProvider, useConfig } from '../../hooks/useConfig';
import { PersistenceProvider } from '../../persistence/index.js';
import { useSimulation } from '../../hooks/useSimulation';
import { stubMatchMedia, viewport, type MatchMediaStub } from '../../test/matchMedia';

let media: MatchMediaStub;

beforeEach(() => {
  media = stubMatchMedia(viewport(1180));
});

afterEach(() => {
  media.restore();
  globalThis.localStorage.clear();
  cleanup();
});

function Harness(): React.JSX.Element {
  const sim = useSimulation();
  const { config } = useConfig();
  return (
    <Routes>
      <Route element={<AppShell sim={sim} config={config} />}>
        <Route index element={<ModulePage title="Overview">overview</ModulePage>} />
        <Route path="setup" element={<ModulePage title="Setup">setup</ModulePage>} />
      </Route>
    </Routes>
  );
}

function Address(): React.JSX.Element {
  const { pathname, search } = useLocation();
  return <p data-testid="address">{`${pathname}${search}`}</p>;
}

function renderShell(): void {
  render(
    <ThemeProvider>
      <PersistenceProvider>
        <ConfigProvider>
          <UnitsProvider>
            <MemoryRouter initialEntries={['/']}>
              <Harness />
              <Address />
            </MemoryRouter>
          </UnitsProvider>
        </ConfigProvider>
      </PersistenceProvider>
    </ThemeProvider>
  );
}

function address(): string {
  return screen.getByTestId('address').textContent ?? '';
}

describe('AppShell — the frame', () => {
  it('stands the rail beside the stage, with no live figure on it', () => {
    renderShell();
    const rail = screen.getByRole('navigation', { name: 'Sections' });

    expect(within(rail).getAllByRole('link').map((a) => a.textContent)).toEqual([
      'Overview',
      'Water',
      'Life',
      'Gear',
      'History',
      'Setup',
    ]);
  });

  it('drives the run from the top bar, wherever the reader is standing', () => {
    renderShell();

    expect(screen.getByText('Day 1 · 00:00')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
  });

  it('keeps the transport and the spine in place across a section change', () => {
    renderShell();
    fireEvent.click(screen.getByRole('link', { name: 'Setup' }));

    expect(address()).toBe('/setup');
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
    expect(screen.getByRole('slider', { name: 'Run timeline' })).toBeTruthy();
  });
});

describe('AppShell — the drawer', () => {
  it('opens Act over the stage, leaving the module mounted behind it', () => {
    renderShell();
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Act/ }));

    expect(screen.getByRole('dialog', { name: 'Act' })).toBeTruthy();
    expect(screen.getByText('overview')).toBeTruthy();
    expect(address()).toBe('/');
  });

  it('closes on Escape and on its own close button', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: /Act/ }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Act/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Close Act' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on a pointer landing outside it', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: /Act/ }));

    fireEvent.pointerDown(screen.getByText('overview'));

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('holds one drawer at a time — Tunables replaces Act', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: /Act/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Tunables' }));

    expect(screen.getByRole('dialog', { name: 'Tunables' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Act' })).toBeNull();
  });

  it('reaches Act from the keyboard, the way the palette is named', () => {
    renderShell();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(screen.getByRole('dialog', { name: 'Act' })).toBeTruthy();
  });
});

describe('AppShell on a phone', () => {
  beforeEach(() => {
    media.set(viewport(390));
  });

  it('folds the rail into a tab bar, with the rest behind More', () => {
    renderShell();
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    expect(within(nav).getAllByRole('link')).toHaveLength(4);

    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    const sheet = screen.getByRole('dialog', { name: 'More' });
    expect(within(sheet).getByRole('link', { name: 'History' })).toBeTruthy();

    fireEvent.click(within(sheet).getByRole('link', { name: 'Setup' }));
    expect(address()).toBe('/setup');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('hands the tabs back to the rail once the viewport grows', () => {
    renderShell();
    act(() => media.set(viewport(1180)));

    const nav = screen.getByRole('navigation', { name: 'Sections' });
    expect(within(nav).getAllByRole('link')).toHaveLength(6);
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
  });
});
