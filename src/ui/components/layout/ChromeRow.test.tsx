import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ChromeRow } from './ChromeRow';
import { ThemeProvider } from '../../hooks/useTheme';
import { ConfigProvider } from '../../hooks/useConfig';
import { PersistenceProvider } from '../../persistence/index.js';
import { createLog, type LogEntry } from '../../../simulation/index.js';
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

function renderRow(logs: LogEntry[] = []): {
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
            logs={logs}
            currentPreset="planted"
            onPresetChange={onPresetChange}
            onOpenIndex={onOpenIndex}
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
    renderRow([
      createLog(10, 'simulation', 'info', 'Tank filled'),
      createLog(36, 'nitrogen-cycle', 'warning', 'High ammonia level: 0.109 ppm'),
    ]);
    expect(screen.getByText('High ammonia level: 0.109 ppm')).toBeTruthy();
    expect(screen.getByText('T36')).toBeTruthy();
    expect(screen.queryByText('Tank filled')).toBeNull();
  });

  it('carries no verbs — husbandry belongs to the rail, construction to the sections', () => {
    renderRow();
    for (const verb of [/feed/i, /water change/i, /top-off/i, /dose/i, /trim/i, /scrub/i]) {
      expect(screen.queryByRole('button', { name: verb })).toBeNull();
    }
  });

  it('switches scenario preset', () => {
    const { onPresetChange } = renderRow();
    fireEvent.change(screen.getByRole('combobox', { name: 'Scenario preset' }), {
      target: { value: 'community' },
    });
    expect(onPresetChange).toHaveBeenCalledWith('community');
  });

  it('opens the index on mobile, and links out to the source', () => {
    const { onOpenIndex } = renderRow();

    fireEvent.click(screen.getByRole('button', { name: 'Open index' }));
    expect(onOpenIndex).toHaveBeenCalledTimes(1);

    const source = screen.getByRole('link', { name: 'Source on GitHub' });
    expect(source.getAttribute('href')).toContain('github.com');
    expect(source.getAttribute('rel')).toContain('noreferrer');
  });
});
