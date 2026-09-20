import React, { useCallback, useState } from 'react';
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
import type { AlertState } from '../../../simulation/index.js';
import { stubMatchMedia, viewport, type MatchMediaStub } from '../../test/matchMedia';
import { useInspector } from '../../hooks/useInspector';
import { Drawer, DRAWER_TOGGLE } from '../ui/Drawer';

let media: MatchMediaStub;

beforeEach(() => {
  media = stubMatchMedia(viewport(1180));
});

afterEach(() => {
  media.restore();
  globalThis.localStorage.clear();
  cleanup();
});

/** A module's own inspector, opened from a row that governs the drawer. */
function Inspector(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  useInspector(open, close);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} {...DRAWER_TOGGLE}>
        Ammonia
      </button>
      <Drawer open={open} onClose={close} title="Ammonia">
        the reading
      </Drawer>
    </>
  );
}

function Harness({ latched }: { latched: Partial<AlertState> }): React.JSX.Element {
  const live = useSimulation();
  const { config } = useConfig();
  const sim = {
    ...live,
    state: { ...live.state, alertState: { ...live.state.alertState, ...latched } },
  };
  return (
    <Routes>
      <Route element={<AppShell sim={sim} config={config} />}>
        <Route
          index
          element={
            <ModulePage title="Overview">
              overview
              <Inspector />
            </ModulePage>
          }
        />
        <Route path="setup" element={<ModulePage title="Setup">setup</ModulePage>} />
      </Route>
    </Routes>
  );
}

function Address(): React.JSX.Element {
  const { pathname, search } = useLocation();
  return <p data-testid="address">{`${pathname}${search}`}</p>;
}

function renderShell(latched: Partial<AlertState> = {}): void {
  render(
    <ThemeProvider>
      <PersistenceProvider>
        <ConfigProvider>
          <UnitsProvider>
            <MemoryRouter initialEntries={['/']}>
              <Harness latched={latched} />
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

describe('AppShell — what needs the keeper', () => {
  it('dots the rail icon of the section an alert stands against', () => {
    renderShell({ highAmmonia: true });

    expect(screen.getByRole('link', { name: 'Water' }).querySelector('.bg-alert')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Life' }).querySelector('.bg-alert')).toBeNull();
  });

  it('dots in the tone the engine gives the alert', () => {
    renderShell({ highAlgae: true });

    expect(screen.getByRole('link', { name: 'Life' }).querySelector('.bg-warn')).toBeTruthy();
  });

  it('counts the same needs in the top bar', () => {
    renderShell({ highAmmonia: true, highAlgae: true });

    expect(screen.getByRole('link', { name: '2 needs you' })).toBeTruthy();
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

  it('holds one drawer at a time — Act replaces a module inspector', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Ammonia' }));
    expect(screen.getByRole('dialog', { name: 'Ammonia' })).toBeTruthy();

    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    expect(screen.getAllByRole('dialog').map((d) => d.getAttribute('aria-label'))).toEqual(['Act']);
  });

  it('holds one drawer at a time — a module inspector replaces Act', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: /Act/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Ammonia' }));

    expect(screen.getAllByRole('dialog').map((d) => d.getAttribute('aria-label'))).toEqual([
      'Ammonia',
    ]);
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

  it('offers the tunables in the sheet, where the top bar has no room for them', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));

    const sheet = screen.getByRole('dialog', { name: 'More' });
    fireEvent.click(within(sheet).getByRole('button', { name: /Tunables/ }));

    expect(screen.getByRole('dialog', { name: 'Tunables' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'More' })).toBeNull();
  });

  it('hands the tabs back to the rail once the viewport grows', () => {
    renderShell();
    act(() => media.set(viewport(1180)));

    const nav = screen.getByRole('navigation', { name: 'Sections' });
    expect(within(nav).getAllByRole('link')).toHaveLength(6);
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
  });
});
