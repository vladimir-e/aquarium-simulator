import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ChromeRow } from './ChromeRow';
import { ThemeProvider } from '../../hooks/useTheme';
import { ConfigProvider } from '../../hooks/useConfig';
import { PersistenceProvider } from '../../persistence/index.js';
import { createLog } from '../../../simulation/index.js';
import { stubMatchMedia, type MatchMediaStub } from '../../test/matchMedia';

let media: MatchMediaStub;

beforeEach(() => {
  media = stubMatchMedia(false);
});

afterEach(() => {
  media.restore();
  globalThis.localStorage.clear();
  cleanup();
});

function renderRow(overrides: Partial<Parameters<typeof ChromeRow>[0]> = {}): {
  onPresetChange: ReturnType<typeof vi.fn>;
  onOpenIndex: ReturnType<typeof vi.fn>;
} {
  const onPresetChange = vi.fn();
  const onOpenIndex = vi.fn();
  render(
    <ThemeProvider>
      <PersistenceProvider>
        <ConfigProvider>
          <ChromeRow
            logs={[]}
            currentPreset="planted"
            onPresetChange={onPresetChange}
            onOpenIndex={onOpenIndex}
            {...overrides}
          />
        </ConfigProvider>
      </PersistenceProvider>
    </ThemeProvider>
  );
  return { onPresetChange, onOpenIndex };
}

describe('ChromeRow', () => {
  it('pins the latest event, and says so when there is none', () => {
    renderRow();
    expect(screen.getByText('No events yet.')).toBeTruthy();

    cleanup();
    renderRow({
      logs: [
        createLog(10, 'simulation', 'info', 'Tank filled'),
        createLog(36, 'nitrogen-cycle', 'warning', 'High ammonia level: 0.109 ppm'),
      ],
    });
    expect(screen.getByText('High ammonia level: 0.109 ppm')).toBeTruthy();
    expect(screen.getByText('T36')).toBeTruthy();
    expect(screen.queryByText('Tank filled')).toBeNull();
  });

  it('carries no verbs — husbandry belongs to the rail, construction to the sections', () => {
    renderRow();
    const buttons = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    expect(buttons).toEqual(['Open index', expect.stringContaining('theme'), 'Debug constants']);
  });

  it('switches scenario preset', () => {
    const { onPresetChange } = renderRow();
    fireEvent.change(screen.getByRole('combobox', { name: 'Scenario preset' }), {
      target: { value: 'community' },
    });
    expect(onPresetChange).toHaveBeenCalledWith('community');
  });

  it('opens the index, and links out to the source', () => {
    const { onOpenIndex } = renderRow();

    fireEvent.click(screen.getByRole('button', { name: 'Open index' }));
    expect(onOpenIndex).toHaveBeenCalledTimes(1);

    const source = screen.getByRole('link', { name: 'Source on GitHub' });
    expect(source.getAttribute('href')).toContain('github.com');
    expect(source.getAttribute('rel')).toContain('noreferrer');
  });

  it('drops the Menu button when the rail stands on its own', () => {
    renderRow({ onOpenIndex: null });
    expect(screen.queryByRole('button', { name: 'Open index' })).toBeNull();
  });
});
