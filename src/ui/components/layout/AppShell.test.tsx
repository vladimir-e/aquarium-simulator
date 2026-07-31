import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from './AppShell';
import { Stage } from './Stage';
import { ThemeProvider } from '../../hooks/useTheme';
import { UnitsProvider } from '../../hooks/useUnits';
import { ConfigProvider, useConfig } from '../../hooks/useConfig';
import { PersistenceProvider } from '../../persistence/index.js';
import { useSimulation } from '../../hooks/useSimulation';
import { MOBILE_QUERY, RAIL_QUERY } from '../../hooks/useMediaQuery';
import { FOCUSABLE } from '../../hooks/useFocusTrap';
import { stubMatchMedia, type MatchMediaStub } from '../../test/matchMedia';

let media: MatchMediaStub;

// Phone: the rail has nowhere to stand, so it lives behind the Menu button.
beforeEach(() => {
  media = stubMatchMedia((query) => query === MOBILE_QUERY);
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
        <Route index element={<Stage title="Water">water</Stage>} />
        <Route path="scenario" element={<Stage title="Scenario">scenario</Stage>} />
      </Route>
    </Routes>
  );
}

function renderShell(): void {
  render(
    <ThemeProvider>
      <PersistenceProvider>
        <ConfigProvider>
          <UnitsProvider>
            <MemoryRouter initialEntries={['/']}>
              <Harness />
            </MemoryRouter>
          </UnitsProvider>
        </ConfigProvider>
      </PersistenceProvider>
    </ThemeProvider>
  );
}

function openDrawer(): HTMLElement {
  const opener = screen.getByRole('button', { name: 'Open index' });
  // fireEvent.click does not focus the way a real pointer does, and the trap's
  // focus restore is only meaningful against a focused opener.
  opener.focus();
  fireEvent.click(opener);
  return screen.getByRole('dialog', { name: 'Index' });
}

/** The dismiss overlay is presentational, so it answers to no role. */
function scrim(drawer: HTMLElement): HTMLElement {
  return drawer.previousElementSibling as HTMLElement;
}

describe('AppShell — the index drawer', () => {
  it('stays shut until the Menu button asks for it', () => {
    renderShell();
    expect(screen.queryByRole('dialog')).toBeNull();

    expect(openDrawer()).toBeTruthy();
  });

  it('is a modal that opens on its own close button, so its name is announced first', () => {
    renderShell();
    const drawer = openDrawer();

    expect(drawer.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close index' }));
  });

  it('wraps Tab at both edges of the panel', () => {
    renderShell();
    const drawer = openDrawer();
    const stops = Array.from(drawer.querySelectorAll<HTMLElement>(FOCUSABLE));
    const [first, last] = [stops[0], stops[stops.length - 1]];

    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('closes on Escape and hands focus back to the Menu button', () => {
    renderShell();
    const opener = screen.getByRole('button', { name: 'Open index' });
    openDrawer();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('closes on its own close button', () => {
    renderShell();
    openDrawer();

    fireEvent.click(screen.getByRole('button', { name: 'Close index' }));

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on the scrim', () => {
    renderShell();

    fireEvent.click(scrim(openDrawer()));

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes once a section is followed, so the stage is not left covered', () => {
    renderShell();
    const drawer = openDrawer();

    fireEvent.click(within(drawer).getByRole('link', { name: /Scenario/ }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Scenario');
  });

  it('hands the index to the standing rail once the viewport grows, mounting it once either way', () => {
    renderShell();
    const drawer = openDrawer();
    // getByRole throws on a second match: the index exists exactly once, and
    // while the drawer is up it lives inside it.
    expect(drawer.contains(screen.getByRole('navigation', { name: 'Sections' }))).toBe(true);

    act(() => media.set((query) => query === RAIL_QUERY));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Sections' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open index' })).toBeNull();
  });
});
