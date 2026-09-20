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
import { TRACKS } from './review';
import { stubMatchMedia, viewport, type MatchMediaStub } from './test/matchMedia';

let media: MatchMediaStub;

// iPad landscape: the rail stands beside the stage rather than folding to tabs.
beforeEach(() => {
  media = stubMatchMedia(viewport(1180));
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

function pageTitle(): string {
  return screen.getAllByRole('heading', { level: 1 })[0].textContent ?? '';
}

describe('App routing', () => {
  it('opens on the Overview, with every widget a window onto its module', () => {
    renderApp();
    const stage = within(screen.getByRole('main'));

    expect(
      ['Nitrogen', 'Life', 'Water', 'Gear', 'Nutrients'].map(
        (title) => stage.getByRole('link', { name: `${title} module` }).getAttribute('href')
      )
    ).toEqual(['/water', '/life', '/water', '/gear', '/water']);
  });

  it('gives every rail item its own address, titled as the rail names it', () => {
    for (const section of SECTIONS) {
      renderApp(section.path);
      expect(screen.getByRole('link', { name: section.label }).getAttribute('aria-current')).toBe(
        'page'
      );
      if (section.id !== 'overview' && section.id !== 'life') expect(pageTitle()).toBe(section.label);
      cleanup();
    }
  });

  it('moves between sections on back', () => {
    renderApp();

    fireEvent.click(screen.getByRole('link', { name: 'Water' }));
    expect(pageTitle()).toBe('Water');

    fireEvent.click(screen.getByRole('link', { name: 'Setup' }));
    expect(pageTitle()).toBe('Setup');

    fireEvent.click(screen.getByRole('button', { name: 'test-back' }));
    expect(pageTitle()).toBe('Water');
  });

  it('addresses a drill-in, and steps back out of it', () => {
    renderApp('/gear');
    const stage = within(screen.getByRole('main'));
    expect(stage.queryByRole('dialog')).toBeNull();

    fireEvent.click(stage.getByRole('link', { name: /^Heater —/ }));
    expect(stage.getByRole('dialog', { name: 'Heater' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'test-back' }));
    expect(pageTitle()).toBe('Gear');
    expect(stage.queryByRole('dialog')).toBeNull();
  });

  it('sends an unknown path home', () => {
    renderApp('/nowhere');
    expect(screen.getByRole('link', { name: 'Nitrogen module' })).toBeTruthy();
  });

  it('marks the section you are standing in', () => {
    renderApp('/water');
    expect(screen.getByRole('link', { name: 'Water' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Gear' }).getAttribute('aria-current')).toBeNull();
  });
});

/**
 * 700 px — between Tailwind's `sm` and `md`, the band a second breakpoint would
 * hide in. The rail cannot stand here, so the frame is compact; every module
 * has to be compact with it, or the stage lays out for a width it does not have.
 */
describe('App at 700 px', () => {
  beforeEach(() => {
    media.set(viewport(700));
  });

  it('folds the rail into the tab bar', () => {
    renderApp();
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    expect(within(nav).getAllByRole('link')).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'More' })).toBeTruthy();
  });

  it('stacks History in one column — every track, then the transcript', () => {
    renderApp('/history');
    const stage = screen.getByRole('main');

    for (const def of TRACKS) {
      expect(within(stage).getByRole('img', { name: def.title })).toBeTruthy();
    }
    expect(within(stage).getByRole('group', { name: 'Log category' })).toBeTruthy();
  });

  it('opens the Gear inspector as a sheet over the rack', () => {
    renderApp('/gear');

    fireEvent.click(within(screen.getByRole('main')).getByRole('link', { name: /^Heater —/ }));

    expect(screen.getByRole('dialog', { name: 'Heater' })).toBeTruthy();
  });
});
