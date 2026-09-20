import React, { useState } from 'react';
import { pickerOptions, type PickerKind, type PickerOption } from '../../build';
import { toneOf } from '../../readings';
import { useUnits } from '../../hooks/useUnits';
import type { FishSpecies, PlantSpecies, SimulationState } from '../../../simulation/index.js';
import { Drawer } from '../ui/Drawer';
import { SpeciesGlyph, type SpeciesKey } from '../ui/SpeciesGlyph';
import { Stepper } from '../ui/Stepper';
import { TONE_TEXT } from '../ui/RangeStrip';

const TITLE: Record<PickerKind, string> = { fish: 'Add fish', plant: 'Add plant' };

function Option({
  option,
  selected,
  onSelect,
}: {
  option: PickerOption;
  selected: boolean;
  onSelect: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`grid w-full grid-cols-[16px_minmax(0,1fr)] items-center gap-x-2.5 gap-y-0.5 border-t border-hairline px-3 py-2 text-left transition-colors first:border-t-0 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${
        selected ? 'bg-accent-tint' : 'hover:bg-surface-2'
      }`}
    >
      <SpeciesGlyph species={option.species as SpeciesKey} />
      <span className="truncate text-[14px] font-medium text-ink">{option.name}</span>
      <span aria-hidden />
      <span className="truncate text-[13px] text-ink-2">{option.demand}</span>
      <span aria-hidden />
      <span className={`truncate text-[12px] ${TONE_TEXT[toneOf(option.status)]}`}>
        {option.fit}
      </span>
    </button>
  );
}

/**
 * The module's "+": a species list read against this tank, a count, and one
 * commit that says what it will do. A refusal takes the commit's place and
 * quotes the action that would have rejected it.
 */
export function AddDrawer({
  kind,
  state,
  onClose,
  onAdd,
}: {
  kind: PickerKind | null;
  state: SimulationState;
  onClose: () => void;
  onAdd: (species: FishSpecies | PlantSpecies, count: number) => void;
}): React.JSX.Element | null {
  const { unitSystem } = useUnits();
  const [count, setCount] = useState(1);
  const [picked, setPicked] = useState<string | null>(null);

  if (kind === null) return null;

  const options = pickerOptions(kind, state, count, unitSystem);
  const option = options.find((o) => o.species === picked) ?? options[0];
  const refusal = count > option.headroom ? (option.refusal ?? `Only ${option.headroom} fit`) : null;

  return (
    <Drawer open onClose={onClose} title={TITLE[kind]} meta={<span className="text-[13px] text-ink-2">pick a species</span>}>
      <div className="flex flex-col">
        <div className="py-1">
          {options.map((candidate) => (
            <Option
              key={candidate.species}
              option={candidate}
              selected={candidate.species === option.species}
              onSelect={() => setPicked(candidate.species)}
            />
          ))}
        </div>

        <div className="flex flex-col gap-3 border-t border-hairline p-3">
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-ink-2">How many</span>
            <Stepper
              value={count}
              onChange={setCount}
              min={1}
              max={Math.max(1, option.headroom)}
              ariaLabel="How many"
            />
          </div>

          {kind === 'fish' && <p className="text-[12px] text-ink-3">Sex is random.</p>}

          {refusal ? (
            <p className={`text-[13px] ${TONE_TEXT.warn}`}>{refusal}</p>
          ) : (
            <button
              type="button"
              onClick={() => onAdd(option.species, count)}
              className="h-9 w-full rounded-control bg-accent-tint text-[14px] font-medium text-accent transition-colors hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Add {count} {option.name}
            </button>
          )}
        </div>
      </div>
    </Drawer>
  );
}
