import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { verbName } from '../actions';
import type { StageContext } from '../components/layout/AppShell';
import { ThemeProvider } from '../hooks/useTheme';
import { UnitsProvider } from '../hooks/useUnits';
import { PersistenceProvider } from '../persistence/index.js';

/** A section on the stage: the providers it reads, and the context the shell gives it. */
export function renderStage(
  section: React.JSX.Element,
  { needs = [], onAct = (): void => {}, actLabel = verbName }: Partial<StageContext> = {}
): void {
  render(
    <ThemeProvider>
      <PersistenceProvider>
        <UnitsProvider>
          <MemoryRouter>
            <Routes>
              <Route element={<Outlet context={{ needs, onAct, actLabel }} />}>
                <Route index element={section} />
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
