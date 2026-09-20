import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../../App';
import { ThemeProvider } from '../../hooks/useTheme';
import { UnitsProvider } from '../../hooks/useUnits';
import { ConfigProvider } from '../../hooks/useConfig';
import { PersistenceProvider } from '../../persistence/index.js';
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

/**
 * The whole instrument, on the tank it opens with: bare, so the two verbs that
 * need plants refuse and the one that needs nothing commits.
 */
function renderApp(path = '/'): void {
  render(
    <ThemeProvider>
      <PersistenceProvider>
        <ConfigProvider>
          <UnitsProvider>
            <MemoryRouter initialEntries={[path]}>
              <App />
            </MemoryRouter>
          </UnitsProvider>
        </ConfigProvider>
      </PersistenceProvider>
    </ThemeProvider>
  );
}

function palette(): HTMLElement {
  fireEvent.keyDown(window, { key: 'k', metaKey: true });
  return screen.getByRole('dialog', { name: 'Act' });
}

function sheet(name: string): HTMLElement {
  return screen.getByRole('dialog', { name });
}

/** What the drawer's preview says one reading would do. */
function preview(reading: string): string {
  return document.querySelector(`[data-reading="${reading}"]`)?.textContent ?? '';
}

/** Action marks the spine carries, which the engine's own log lines put there. */
function actionMarks(): number {
  return document.querySelectorAll('footer .bg-accent').length;
}

describe('the Act palette', () => {
  it('lists every verb with the amount it would use and the module it lives in', () => {
    renderApp();
    const rows = within(palette()).getAllByRole('button').filter((row) => row.dataset.verb);

    expect(rows.map((row) => row.getAttribute('data-verb'))).toEqual([
      'feed',
      'waterChange',
      'topOff',
      'dose',
      'trimPlants',
      'scrubAlgae',
      'addFish',
      'addPlant',
      'addHardscape',
    ]);
    expect(within(rows[0]).getByText('0.5 g')).toBeTruthy();
    expect(within(rows[0]).getByText('Life')).toBeTruthy();
  });

  it('states a refusal where a verb would otherwise carry its amount', () => {
    renderApp();
    const dose = within(palette()).getByRole('button', { name: /^Dose/ });

    expect(dose.textContent).toContain('no plants to fertilise');
  });

  it('filters as the reader types, and Enter opens the one match', () => {
    renderApp();
    const list = palette();

    fireEvent.change(within(list).getByRole('textbox'), { target: { value: 'top' } });
    expect(within(list).getAllByRole('button', { name: /Top off/ })).toHaveLength(1);

    fireEvent.keyDown(within(list).getByRole('textbox'), { key: 'Enter' });
    expect(sheet('Top off')).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Act' })).toBeNull();
  });

  it('hands a construction verb to the module that owns the picker', () => {
    renderApp();
    fireEvent.click(within(palette()).getByRole('button', { name: /Add fish/ }));

    expect(screen.getByRole('dialog', { name: /Add fish/ })).toBeTruthy();
  });
});

describe('a verb sheet', () => {
  it('commits the amount on the rung the reader is standing on', () => {
    renderApp();
    fireEvent.click(within(palette()).getByRole('button', { name: /^Feed/ }));

    expect(preview('food')).toContain('0.00');
    const marks = actionMarks();
    fireEvent.click(within(sheet('Feed')).getByRole('button', { name: 'Feed 0.5 g' }));

    expect(screen.queryByRole('dialog', { name: 'Feed' })).toBeNull();
    expect(actionMarks()).toBe(marks + 1);
    // The engine took the food, so the next preview starts where the last one left off.
    fireEvent.click(within(palette()).getByRole('button', { name: /^Feed/ }));
    expect(preview('food')).toContain('0.50');
  });

  it('keeps the amount chosen for a verb until it is chosen again', () => {
    renderApp();
    fireEvent.click(within(palette()).getByRole('button', { name: /^Feed/ }));
    fireEvent.click(within(sheet('Feed')).getByRole('button', { name: /^1 g/ }));
    fireEvent.keyDown(document, { key: 'Escape' });

    fireEvent.click(within(palette()).getByRole('button', { name: /^Feed/ }));
    expect(within(sheet('Feed')).getByRole('button', { name: 'Feed 1 g' })).toBeTruthy();
  });

  it('names the promoted verb on the top bar once one has been committed', () => {
    renderApp();
    expect(screen.getByRole('button', { name: 'Act' }).textContent).toContain('Act');

    fireEvent.click(within(palette()).getByRole('button', { name: /^Feed/ }));
    fireEvent.click(within(sheet('Feed')).getByRole('button', { name: 'Feed 0.5 g' }));

    expect(screen.getByRole('button', { name: 'Act' }).textContent).toContain('Feed · 0.5 g');
  });

  it('commits on Enter, the way the palette opens on ⌘K', () => {
    renderApp();
    fireEvent.click(within(palette()).getByRole('button', { name: /^Feed/ }));
    const marks = actionMarks();
    const commit = within(sheet('Feed')).getByRole('button', { name: 'Feed 0.5 g' });

    // The sheet opens on its commit, so Enter lands there without a click first.
    expect(document.activeElement).toBe(commit);
    fireEvent.keyDown(commit, { key: 'Enter' });

    expect(screen.queryByRole('dialog', { name: 'Feed' })).toBeNull();
    expect(actionMarks()).toBe(marks + 1);
  });

  it('leaves Enter on a rung to the rung, rather than committing on it', () => {
    renderApp();
    fireEvent.click(within(palette()).getByRole('button', { name: /^Feed/ }));
    const marks = actionMarks();

    fireEvent.keyDown(within(sheet('Feed')).getByRole('button', { name: /^1 g/ }), {
      key: 'Enter',
    });

    expect(sheet('Feed')).toBeTruthy();
    expect(actionMarks()).toBe(marks);
  });

  it('opens on the first rung where a refusal leaves no commit to stand on', () => {
    renderApp();
    fireEvent.click(within(palette()).getByRole('button', { name: /^Dose/ }));

    expect(document.activeElement).toBe(
      within(sheet('Dose fertiliser')).getByRole('button', { name: /^1 ml/ })
    );
  });

  it('puts the engine’s refusal where the commit would be, and previews nothing', () => {
    renderApp();
    fireEvent.click(within(palette()).getByRole('button', { name: /^Dose/ }));
    const drawer = within(sheet('Dose fertiliser'));

    expect(drawer.getByText('no plants to fertilise')).toBeTruthy();
    expect(drawer.queryByRole('button', { name: /^Dose \d/ })).toBeNull();
    expect(drawer.queryByText('After')).toBeNull();
  });
});

describe('a contextual verb', () => {
  it('opens the same sheet from the module that owns it', () => {
    renderApp('/water');

    fireEvent.click(screen.getAllByRole('button', { name: /^Water change/ })[0]);
    expect(sheet('Water change')).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: /^Dose/ })[0]);
    expect(sheet('Dose fertiliser')).toBeTruthy();
  });

  it('opens Feed from the Life module, on the amount it names', () => {
    renderApp('/life');

    fireEvent.click(screen.getAllByRole('button', { name: /^Feed/ })[0]);
    expect(within(sheet('Feed')).getByRole('button', { name: 'Feed 0.5 g' })).toBeTruthy();
  });
});
