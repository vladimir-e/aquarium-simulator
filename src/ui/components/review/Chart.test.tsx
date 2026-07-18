import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Chart } from './Chart';
import { REVIEW_CHARTS } from '../../review/index.js';
import type { RunSnapshot } from '../../run/index.js';

afterEach(cleanup);

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
      />
    );
    expect(screen.getByRole('img', { name: /Nitrogen cycle over ticks 0–2/ })).toBeTruthy();
    expect(screen.getByText('tick 0')).toBeTruthy();
    expect(screen.getByText('tick 2')).toBeTruthy();
    expect(screen.getAllByText('NH₃ @2').length).toBeGreaterThan(0);
  });
});
