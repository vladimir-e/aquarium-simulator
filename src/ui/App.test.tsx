import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import App from './App';
import { ThemeProvider } from './hooks/useTheme';
import { UnitsProvider } from './hooks/useUnits';
import { ConfigProvider } from './hooks/useConfig';
import { PersistenceProvider } from './persistence/index.js';
import { SECTIONS } from './nav';
import { stubMatchMedia, viewport, type MatchMediaStub } from './test/matchMedia';

let media: MatchMediaStub;

// Desktop: the rail stands beside the stage rather than living in a drawer.
beforeEach(() => {
  media = stubMatchMedia(viewport(1280));
});

afterEach(() => {
  media.restore();
  globalThis.localStorage.clear();
  cleanup();
});

/** Drives the router's history the way the browser's back gesture does. */
function BackButton(): React.JSX.Element {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(-1)}>
      test-back
    </button>
  );
}

function renderApp(path = '/'): void {
  render(
    <ThemeProvider>
      <PersistenceProvider>
        <ConfigProvider>
          <UnitsProvider>
            <MemoryRouter initialEntries={[path]}>
              <App />
              <BackButton />
            </MemoryRouter>
          </UnitsProvider>
        </ConfigProvider>
      </PersistenceProvider>
    </ThemeProvider>
  );
}

function stageTitle(): string {
  return screen.getByRole('heading', { level: 1 }).textContent ?? '';
}

describe('App routing', () => {
  it('opens on Water, with the tank chemistry on the stage', () => {
    renderApp();
    expect(stageTitle()).toBe('Water');
    // Scoped to the stage: the rail carries NH₃/NO₂/NO₃ too, so an unscoped
    // query passes on an empty section.
    const stage = within(screen.getByRole('main'));
    for (const label of ['Temp', 'pH', 'Level', 'NH₃', 'NO₂', 'NO₃']) {
      expect(stage.getByText(label)).toBeTruthy();
    }
  });

  it('gives every section its own address', () => {
    for (const section of SECTIONS) {
      renderApp(section.path);
      expect(stageTitle()).toBe(section.label);
      cleanup();
    }
  });

  it('moves between sections on back — the requirement the reset was gated on', () => {
    renderApp();

    fireEvent.click(screen.getByRole('link', { name: /Livestock/ }));
    expect(stageTitle()).toBe('Livestock');

    fireEvent.click(screen.getByRole('link', { name: /Scenario/ }));
    expect(stageTitle()).toBe('Scenario');

    fireEvent.click(screen.getByRole('button', { name: 'test-back' }));
    expect(stageTitle()).toBe('Livestock');

    fireEvent.click(screen.getByRole('button', { name: 'test-back' }));
    expect(stageTitle()).toBe('Water');
  });

  it('addresses a drill-in, and steps back out of it', () => {
    renderApp('/equipment');
    const stage = within(screen.getByRole('main'));
    expect(stage.queryByRole('heading', { level: 3 })).toBeNull();

    fireEvent.click(stage.getByRole('link', { name: /Heater/ }));
    expect(stage.getByRole('heading', { level: 3, name: 'Heater' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'test-back' }));
    expect(stageTitle()).toBe('Equipment');
    expect(stage.queryByRole('heading', { level: 3 })).toBeNull();
  });

  it('sends an unknown path home', () => {
    renderApp('/nowhere');
    expect(stageTitle()).toBe('Water');
  });

  it('marks the section you are standing in', () => {
    renderApp('/flora');
    expect(screen.getByRole('link', { name: /Flora/ }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: /Water/ }).getAttribute('aria-current')).toBeNull();
  });
});

/**
 * 700 px — between Tailwind's `sm` and `md`, the band a second breakpoint would
 * hide in. The rail cannot stand here, so the chrome is compact; every section
 * has to be compact with it, or the stage lays out for a width it does not have.
 */
describe('App at 700 px', () => {
  beforeEach(() => {
    media.set(viewport(700));
  });

  it('folds the index into the drawer rather than standing it beside the stage', () => {
    renderApp();
    expect(screen.getByRole('button', { name: 'Open index' })).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Sections' })).toBeNull();
  });

  it('gives Analytics the chart chips, not the 2×2 grid it has no room for', () => {
    renderApp('/analytics');

    expect(screen.getByRole('group', { name: 'Chart' })).toBeTruthy();
    expect(screen.getByText('Nitrogen cycle')).toBeTruthy();
    expect(screen.queryByText('pH & CO₂')).toBeNull();
  });

  it('pushes the Equipment inspector over the list instead of beside it', () => {
    renderApp('/equipment');

    fireEvent.click(within(screen.getByRole('main')).getByRole('link', { name: /Heater/ }));

    expect(screen.getByRole('dialog', { name: 'Heater settings' })).toBeTruthy();
  });

  it('drills the Actions sheet in rather than floating it beside the rail', () => {
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: /Feed/ }));
    const sheet = screen.getByRole('dialog', { name: 'Actions' });

    expect(within(sheet).queryByRole('heading')).toBeNull();
    expect(within(sheet).getByRole('group', { name: 'Verbs' })).toBeTruthy();
  });
});
