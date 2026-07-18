import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Chart } from './Chart';
import { REVIEW_CHARTS } from '../../review/index.js';
import type { RunSnapshot } from '../../run/index.js';

afterEach(cleanup);

/** Feeds the chart a fixed plot width so click geometry is deterministic. */
type ObserverCb = (entries: Array<{ contentRect: { width: number } }>) => void;
class FakeResizeObserver {
  private cb: ObserverCb;
  constructor(cb: ObserverCb) {
    this.cb = cb;
  }
  observe(): void {
    this.cb([{ contentRect: { width: 300 } }]);
  }
  unobserve(): void {}
  disconnect(): void {}
}

const nitrogen = REVIEW_CHARTS[0];

function snap(tick: number, ammonia: number): RunSnapshot {
  return {
    tick,
    ammonia,
    nitrite: 0,
    nitrate: 10,
    ph: 7,
    oxygen: 8,
    co2: 5,
    temperature: 25,
    waterPct: 100,
    fishCount: 0,
    plantAvgSize: 0,
    algaeMass: 0,
    food: 0,
  };
}

describe('Chart', () => {
  it('titles the frame and legends every series', () => {
    render(
      <Chart
        def={nitrogen}
        history={[]}
        range={null}
        currentTick={0}
        theme="light"
        markers={[]}
        onScrubToTick={() => {}}
        displayTemp={(c) => c}
      />
    );
    expect(screen.getByText('Nitrogen cycle')).toBeTruthy();
    for (const label of ['NH₃', 'NO₂', 'NO₃']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('shows an empty state without a window range', () => {
    render(
      <Chart
        def={nitrogen}
        history={[]}
        range={null}
        currentTick={0}
        theme="light"
        markers={[]}
        onScrubToTick={() => {}}
        displayTemp={(c) => c}
      />
    );
    expect(screen.getByText('No data in this window yet.')).toBeTruthy();
  });

  it('plots the series and endpoints when it has data', () => {
    const history = [snap(0, 0.02), snap(1, 0.05), snap(2, 0.11)];
    render(
      <Chart
        def={nitrogen}
        history={history}
        range={{ minTick: 0, maxTick: 2 }}
        currentTick={2}
        theme="light"
        markers={[{ tick: 2, kind: 'ammonia' }]}
        onScrubToTick={vi.fn()}
        displayTemp={(c) => c}
      />
    );
    expect(screen.getByRole('img', { name: /Nitrogen cycle over ticks 0–2/ })).toBeTruthy();
    expect(screen.getByText('tick 0')).toBeTruthy();
    expect(screen.getByText('tick 2')).toBeTruthy();
    expect(screen.getAllByText('NH₃ @2').length).toBeGreaterThan(0);
  });

  it('scrubs to the tick under a click, accounting for the plot inset', () => {
    // A FakeResizeObserver fixes the plot at 300px ⇒ plotW = 300 − PAD.left − PAD.right = 280.
    // Clicking at PAD.left + 0.5·plotW must land on the domain midpoint, not 8px off.
    const original = globalThis.ResizeObserver;
    globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof globalThis.ResizeObserver;
    try {
      const onScrubToTick = vi.fn();
      const history = [snap(0, 0), snap(280, 0)];
      render(
        <Chart
          def={nitrogen}
          history={history}
          range={{ minTick: 0, maxTick: 280 }}
          currentTick={0}
          theme="light"
          markers={[]}
          onScrubToTick={onScrubToTick}
          displayTemp={(c) => c}
        />
      );

      const plotDiv = screen.getByRole('img').parentElement as HTMLElement;
      // The click target (= the measured element) must carry no horizontal padding,
      // or the SVG origin drifts from rect.left and clicks land off — the px-2 bug.
      expect(plotDiv.className).not.toMatch(/(^|\s)p[xl]-/);
      plotDiv.getBoundingClientRect = (): ReturnType<typeof plotDiv.getBoundingClientRect> => ({
        left: 0,
        top: 0,
        right: 300,
        bottom: 156,
        width: 300,
        height: 156,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });

      fireEvent.click(plotDiv, { clientX: 150 }); // PAD.left (10) + 0.5·280
      expect(onScrubToTick).toHaveBeenCalledWith(140);
    } finally {
      globalThis.ResizeObserver = original;
    }
  });
});
