import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import App from '../../App';
import { ThemeProvider } from '../../hooks/useTheme';
import { UnitsProvider } from '../../hooks/useUnits';
import { ConfigProvider } from '../../hooks/useConfig';
import { flushPendingSave, PersistenceProvider } from '../../persistence/index.js';
import { stubMatchMedia, viewport, type MatchMediaStub } from '../../test/matchMedia';

let media: MatchMediaStub;

beforeEach(() => {
  media = stubMatchMedia(viewport(1180));
});

// Unmount first: the provider flushes its pending save on the way out, and a
// tank that saved after the wipe would be the next test's opening state.
afterEach(() => {
  cleanup();
  media.restore();
  globalThis.localStorage.clear();
});

/**
 * The whole instrument, on the tank it opens with: bare, so the two verbs that
 * need plants refuse and the one that needs nothing commits.
 */
function Address(): React.JSX.Element {
  const { pathname, search } = useLocation();
  return (
    <span data-testid="address" hidden>{`${pathname}${search}`}</span>
  );
}

function address(): string {
  return screen.getByTestId('address').textContent ?? '';
}

function renderApp(path = '/'): void {
  render(
    <ThemeProvider>
      <PersistenceProvider>
        <ConfigProvider>
          <UnitsProvider>
            <MemoryRouter initialEntries={[path]}>
              <App />
              <Address />
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
    const rows = within(palette()).getAllByRole('option');

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
    const dose = within(palette()).getByRole('option', { name: /^Dose/ });

    expect(dose.textContent).toContain('no plants to fertilise');
  });

  it('filters as the reader types, and Enter opens the one match', () => {
    renderApp();
    const list = palette();

    fireEvent.change(within(list).getByRole('combobox'), { target: { value: 'top' } });
    expect(within(list).getAllByRole('option', { name: /Top off/ })).toHaveLength(1);

    fireEvent.keyDown(within(list).getByRole('combobox'), { key: 'Enter' });
    expect(sheet('Top off')).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Act' })).toBeNull();
  });

  it('says which row the filter is standing on, and moves it with the arrows', () => {
    renderApp();
    const list = palette();
    const input = within(list).getByRole('combobox');
    const rows = within(list).getAllByRole('option');

    expect(input.getAttribute('aria-controls')).toBe(within(list).getByRole('listbox').id);
    expect(input.getAttribute('aria-activedescendant')).toBe(rows[0].id);
    expect(rows[0].getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe(rows[1].id);
    expect(rows[1].getAttribute('aria-selected')).toBe('true');
    expect(rows[0].getAttribute('aria-selected')).toBe('false');
  });

  it('hands a construction verb to the module that owns the picker', () => {
    renderApp();
    fireEvent.click(within(palette()).getByRole('option', { name: /Add fish/ }));

    expect(screen.getByRole('dialog', { name: /Add fish/ })).toBeTruthy();
  });

  it('leaves the view the reader is parked on where it is', () => {
    renderApp('/?window=7d');
    fireEvent.click(within(palette()).getByRole('option', { name: /Add fish/ }));

    expect(address()).toBe('/life?window=7d&add=fish');
  });
});

describe('a verb sheet', () => {
  it('commits the amount on the rung the reader is standing on', () => {
    renderApp();
    fireEvent.click(within(palette()).getByRole('option', { name: /^Feed/ }));

    expect(preview('food')).toContain('0.00');
    const marks = actionMarks();
    fireEvent.click(within(sheet('Feed')).getByRole('button', { name: 'Feed 0.5 g' }));

    expect(screen.queryByRole('dialog', { name: 'Feed' })).toBeNull();
    expect(actionMarks()).toBe(marks + 1);
    // The engine took the food, so the next preview starts where the last one left off.
    fireEvent.click(within(palette()).getByRole('option', { name: /^Feed/ }));
    expect(preview('food')).toContain('0.50');
  });

  it('reads the preview on the reading’s own track: a ghost where it stands', () => {
    renderApp();
    fireEvent.click(within(palette()).getByRole('option', { name: /^Feed/ }));

    const ghost = document.querySelector<HTMLElement>('[data-reading="food"] [data-ghost]')!;
    const track = ghost.parentElement!;
    const marker = track.lastElementChild as HTMLElement;

    // Nothing in the water, and half a gram of it on a track that runs to two.
    expect(ghost.style.left).toBe('calc(0% - 1px)');
    expect(marker.style.left).toBe('calc(25% - 1px)');
    expect(track.querySelector('[data-band]')).toBeNull();
  });

  it('keeps the amount chosen for a verb until it is chosen again', () => {
    renderApp();
    fireEvent.click(within(palette()).getByRole('option', { name: /^Feed/ }));
    fireEvent.click(within(sheet('Feed')).getByRole('button', { name: /^1 g/ }));
    fireEvent.keyDown(document, { key: 'Escape' });

    fireEvent.click(within(palette()).getByRole('option', { name: /^Feed/ }));
    expect(within(sheet('Feed')).getByRole('button', { name: 'Feed 1 g' })).toBeTruthy();
  });

  it('names the promoted verb on the top bar once one has been committed', () => {
    renderApp();
    expect(screen.getByRole('button', { name: 'Act' })).toBeTruthy();

    fireEvent.click(within(palette()).getByRole('option', { name: /^Feed/ }));
    fireEvent.click(within(sheet('Feed')).getByRole('button', { name: 'Feed 0.5 g' }));

    // The label the reader sees is the name the reader hears.
    expect(screen.getByRole('button', { name: 'Act — Feed · 0.5 g' }).textContent).toContain(
      'Feed · 0.5 g'
    );
  });

  it('commits on Enter, the way the palette opens on ⌘K', () => {
    renderApp();
    fireEvent.click(within(palette()).getByRole('option', { name: /^Feed/ }));
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
    fireEvent.click(within(palette()).getByRole('option', { name: /^Feed/ }));
    const marks = actionMarks();

    fireEvent.keyDown(within(sheet('Feed')).getByRole('button', { name: /^1 g/ }), {
      key: 'Enter',
    });

    expect(sheet('Feed')).toBeTruthy();
    expect(actionMarks()).toBe(marks);
  });

  it('opens on the first rung where a refusal leaves no commit to stand on', () => {
    renderApp();
    fireEvent.click(within(palette()).getByRole('option', { name: /^Dose/ }));

    expect(document.activeElement).toBe(
      within(sheet('Dose fertiliser')).getByRole('button', { name: /^1 ml/ })
    );
  });

  it('puts the engine’s refusal where the commit would be, and previews nothing', () => {
    renderApp();
    fireEvent.click(within(palette()).getByRole('option', { name: /^Dose/ }));
    const drawer = within(sheet('Dose fertiliser'));

    expect(drawer.getByText('no plants to fertilise')).toBeTruthy();
    expect(drawer.queryByRole('button', { name: /^Dose \d/ })).toBeNull();
    expect(drawer.queryByText('After')).toBeNull();
  });
});

describe('the amounts a keeper settles on', () => {
  it('outlive the session that chose them, with the verb Act is named for', () => {
    renderApp();
    fireEvent.click(within(palette()).getByRole('option', { name: /^Feed/ }));
    fireEvent.click(within(sheet('Feed')).getByRole('button', { name: /^1 g/ }));
    fireEvent.click(within(sheet('Feed')).getByRole('button', { name: 'Feed 1 g' }));
    flushPendingSave();
    cleanup();

    renderApp();
    expect(screen.getByRole('button', { name: /^Act/ }).textContent).toContain('Feed · 1 g');
    fireEvent.click(within(palette()).getByRole('option', { name: /^Feed/ }));
    expect(within(sheet('Feed')).getByRole('button', { name: 'Feed 1 g' })).toBeTruthy();
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
