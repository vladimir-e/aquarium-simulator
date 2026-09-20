import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { DEFAULT_SETTINGS, verbLabel, withAmount, type VerbId } from '../actions';
import type { SimulationState } from '../../simulation/index.js';
import { bare } from './run';
import type { StageContext } from '../components/layout/AppShell';
import { ThemeProvider } from '../hooks/useTheme';
import { UnitsProvider } from '../hooks/useUnits';
import { PersistenceProvider } from '../persistence/index.js';

function Address(): React.JSX.Element {
  return <span data-testid="address" hidden>{useLocation().search}</span>;
}

/** The query the stage is standing on, for a surface that keeps state in it. */
export function query(): globalThis.URLSearchParams {
  return new globalThis.URLSearchParams(screen.getByTestId('address').textContent ?? '');
}

/** A section on the stage: the providers it reads, and the context the shell gives it. */
export function renderStage(
  section: React.JSX.Element,
  {
    path = '/',
    state = bare().state,
    needs = [],
    onAct = (): void => {},
    actLabel = (verb: VerbId, at?: number): string =>
      verbLabel(state, verb, withAmount(DEFAULT_SETTINGS, verb, at), 'metric'),
  }: Partial<StageContext> & { path?: string; state?: SimulationState } = {}
): void {
  render(
    <ThemeProvider>
      <PersistenceProvider>
        <UnitsProvider>
          <MemoryRouter initialEntries={[path]}>
            <Address />
            <Routes>
              <Route element={<Outlet context={{ needs, onAct, actLabel }} />}>
                <Route path="*" element={section} />
              </Route>
            </Routes>
          </MemoryRouter>
        </UnitsProvider>
      </PersistenceProvider>
    </ThemeProvider>
  );
}

/** A headed run of rows — a widget or a lab-sheet group — by its heading. */
export function group(title: string): HTMLElement {
  return screen.getByRole('heading', { level: 2, name: title }).closest('section')!;
}

/** A reading row inside the group that owns it: NO₃ is read in two of them. */
export function row(title: string, name: string): HTMLElement {
  return within(group(title)).getByRole('button', { name: new RegExp(`^${name} `) });
}
