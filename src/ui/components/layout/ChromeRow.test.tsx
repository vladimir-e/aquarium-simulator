import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ChromeRow } from './ChromeRow';
import { ThemeProvider } from '../../hooks/useTheme';
import { ConfigProvider } from '../../hooks/useConfig';
import { PresetLoadProvider } from '../../hooks/usePresetLoad';
import { PersistenceProvider } from '../../persistence/index.js';
import { createLog, type SimulationState } from '../../../simulation/index.js';
import { stubMatchMedia, viewport, type MatchMediaStub } from '../../test/matchMedia';
import { presetTank } from '../../test/presetTank';

let media: MatchMediaStub;

beforeEach(() => {
  media = stubMatchMedia(viewport(1280));
});

afterEach(() => {
  media.restore();
  globalThis.localStorage.clear();
  cleanup();
});

const PLANTED = presetTank('planted');
const PROGRESSED = presetTank('planted', { days: 5 });

function renderRow(
  overrides: Partial<Parameters<typeof ChromeRow>[0]> = {},
  state: SimulationState = PROGRESSED
): {
  onLoadPreset: ReturnType<typeof vi.fn>;
  onOpenIndex: ReturnType<typeof vi.fn>;
} {
  const onLoadPreset = vi.fn();
  const onOpenIndex = vi.fn();
  render(
    <ThemeProvider>
      <PersistenceProvider>
        <ConfigProvider>
          <PresetLoadProvider current="planted" state={state} onLoad={onLoadPreset}>
            <ChromeRow logs={[]} onOpenIndex={onOpenIndex} {...overrides} />
          </PresetLoadProvider>
        </ConfigProvider>
      </PersistenceProvider>
    </ThemeProvider>
  );
  return { onLoadPreset, onOpenIndex };
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

  it('holds a preset load behind the confirmation, whichever way it is cancelled', () => {
    const { onLoadPreset } = renderRow();
    const selector = screen.getByRole('combobox', { name: 'Scenario preset' });

    fireEvent.change(selector, { target: { value: 'community' } });
    expect(onLoadPreset).not.toHaveBeenCalled();
    expect(screen.getByText('Start a new tank?')).toBeTruthy();
    // The message is the whole point of the dialog: the tank in the room goes.
    expect(
      screen.getByText(/“Balanced Community” as a new tank at hour zero\. This one — 5d — goes/)
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onLoadPreset).not.toHaveBeenCalled();
    expect(screen.queryByText('Start a new tank?')).toBeNull();

    fireEvent.change(selector, { target: { value: 'betta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(onLoadPreset).toHaveBeenCalledExactlyOnceWith('betta');
  });

  it('loads straight through on a tank with no clock and nothing living in it', () => {
    const { onLoadPreset } = renderRow({}, PLANTED);

    fireEvent.change(screen.getByRole('combobox', { name: 'Scenario preset' }), {
      target: { value: 'community' },
    });

    expect(screen.queryByText('Start a new tank?')).toBeNull();
    expect(onLoadPreset).toHaveBeenCalledExactlyOnceWith('community');
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
