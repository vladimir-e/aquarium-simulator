import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { PlantsCard } from './PlantsCard';
import type { AlgaeRow, PlantRow } from '../../run';

afterEach(cleanup);

function plant(net: number): PlantRow {
  return {
    id: 'p1',
    name: 'Java Fern',
    size: 60,
    overTrim: false,
    condition: 90,
    status: 'ok',
    word: 'thriving',
    net,
    stressors: [{ key: 'nutrients', label: 'Nutrient deficiency', amount: Math.max(0, -net) }],
    benefits: [{ key: 'light', label: 'Light', amount: Math.max(0, net) }],
  };
}

function algae(net: number): AlgaeRow {
  return {
    mass: 40,
    status: 'warn',
    word: 'active',
    net,
    stressors: [{ key: 'competition', label: 'Plant competition', amount: Math.max(0, -net) }],
    benefits: [{ key: 'nutrients', label: 'Nutrients', amount: Math.max(0, net) }],
  };
}

function renderCard(rows: PlantRow[], row = algae(0.8)): void {
  render(
    <PlantsCard
      rows={rows}
      algae={row}
      maxPlants={31}
      overTrim={rows.filter((r) => r.overTrim).length}
      onRemove={vi.fn()}
    />
  );
}

/** The collapsed row's rate and the `net` line under it are the same number. */
function tones(name: string, collapsed: string): string[] {
  const header = screen.getByText(collapsed).className;
  fireEvent.click(screen.getByText(name));
  return [header, screen.getByText('net').parentElement!.className];
}

function tone(classNames: string): 'ok' | 'alert' {
  expect(classNames).toMatch(/text-(ok|alert)/);
  return classNames.includes('text-ok') ? 'ok' : 'alert';
}

describe('PlantsCard — rate sentiment', () => {
  it('reads a plant gaining condition as good news, collapsed and expanded alike', () => {
    renderCard([plant(0.4)]);
    expect(tones('Java Fern', '+0.4 %/h').map(tone)).toEqual(['ok', 'ok']);
  });

  it('reads a plant losing condition as bad news', () => {
    renderCard([plant(-0.4)]);
    expect(tones('Java Fern', '−0.4 %/h').map(tone)).toEqual(['alert', 'alert']);
  });

  it('inverts the algae: a bloom is bad news at the same sign', () => {
    renderCard([], algae(0.8));
    expect(tones('Algae', '+0.8 %/h').map(tone)).toEqual(['alert', 'alert']);
  });

  it('inverts the algae the other way too: receding algae is good news', () => {
    renderCard([], algae(-0.8));
    expect(tones('Algae', '−0.8 %/h').map(tone)).toEqual(['ok', 'ok']);
  });

  it('says nothing about a rate too small to print', () => {
    renderCard([plant(0.01)], algae(0));
    expect(screen.queryByText(/%\/h/)).toBeNull();
  });
});

describe('PlantsCard — header', () => {
  it('counts the plants off the ok band', () => {
    renderCard([plant(0.4), { ...plant(-0.4), id: 'p2', status: 'warn', word: 'fair' }]);
    expect(screen.getByText('2 of 31 slots · 1 ailing')).toBeTruthy();
  });

  it('leaves the count off while every plant is fine', () => {
    renderCard([plant(-0.4)]);
    expect(screen.getByText('1 of 31 slots')).toBeTruthy();
  });
});
