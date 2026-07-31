import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import App from './App';
import { ThemeProvider } from './hooks/useTheme';
import { UnitsProvider } from './hooks/useUnits';
import { ConfigProvider } from './hooks/useConfig';
import { PersistenceProvider } from './persistence/index.js';
import { SECTIONS } from './nav';
import { RAIL_QUERY } from './hooks/useMediaQuery';
import { stubMatchMedia, type MatchMediaStub } from './test/matchMedia';

let media: MatchMediaStub;

// Desktop: the rail stands beside the stage rather than living in a drawer.
beforeEach(() => {
  media = stubMatchMedia((query) => query === RAIL_QUERY);
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
    for (const label of ['NH₃', 'NO₂', 'NO₃', 'Temp']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
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
