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

// Phone: no room beside the stage, so palette and sheet are both full-height.
beforeEach(() => {
  media = stubMatchMedia(viewport(390));
  render(
    <ThemeProvider>
      <PersistenceProvider>
        <ConfigProvider>
          <UnitsProvider>
            <MemoryRouter initialEntries={['/life']}>
              <App />
            </MemoryRouter>
          </UnitsProvider>
        </ConfigProvider>
      </PersistenceProvider>
    </ThemeProvider>
  );
});

afterEach(() => {
  cleanup();
  media.restore();
  globalThis.localStorage.clear();
});

function palette(): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: /^Act/ }));
  return screen.getByRole('dialog', { name: 'Act' });
}

describe('acting on a phone', () => {
  it('lays the palette over the whole screen, and opens on its filter', () => {
    const list = palette();

    expect(list.className).toContain('fixed inset-0');
    expect(document.activeElement).toBe(within(list).getByRole('combobox'));
    expect(within(list).getAllByRole('option')).toHaveLength(9);
  });

  it('drills from the palette into the verb sheet, which covers it in turn', () => {
    fireEvent.click(within(palette()).getByRole('option', { name: /^Feed/ }));

    const sheet = screen.getByRole('dialog', { name: 'Feed' });
    expect(screen.queryByRole('dialog', { name: 'Act' })).toBeNull();
    expect(sheet.className).toContain('fixed inset-0');
    expect(within(sheet).getByRole('button', { name: 'Feed 0.5 g' })).toBeTruthy();
  });

  it('commits from the sheet and leaves the stage standing behind it', () => {
    fireEvent.click(within(palette()).getByRole('option', { name: /^Feed/ }));
    const marks = document.querySelectorAll('footer .bg-accent').length;

    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Feed' })).getByRole('button', {
        name: 'Feed 0.5 g',
      })
    );

    expect(screen.queryByRole('dialog', { name: 'Feed' })).toBeNull();
    expect(document.querySelectorAll('footer .bg-accent')).toHaveLength(marks + 1);
    expect(screen.getByRole('heading', { level: 1, name: 'Life' })).toBeTruthy();
  });
});
