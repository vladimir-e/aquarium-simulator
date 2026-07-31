import React from 'react';
import { RotateCcw } from 'lucide-react';
import type { PresetCard } from '../../build';
import type { PresetId } from '../../presets.js';
import { Pill, RunButton } from '../run/elements';
import { CONTROL_FOCUS } from '../ui/focus';

function Build({ card }: { card: PresetCard }): React.JSX.Element {
  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-[14px] font-semibold text-ink">{card.name}</span>
        <span className="font-mono text-[12px] tabular-nums text-ink-2">{card.volume}</span>
      </div>
      <p className="mt-1 font-mono text-[11px] leading-[1.5] text-ink-3">{card.build}</p>
    </>
  );
}

/**
 * The five presets, each naming the tank it sets up. The loaded one is not a
 * switch target — it carries the drift indicator and the restore instead.
 */
export function PresetPicker({
  cards,
  current,
  modified,
  onSelect,
  onRestore,
}: {
  cards: PresetCard[];
  current: PresetId;
  /** Equipment or stocking has moved away from the loaded preset's defaults. */
  modified: boolean;
  onSelect: (id: PresetId) => void;
  onRestore: () => void;
}): React.JSX.Element {
  return (
    <ul className="flex flex-col gap-2">
      {cards.map((card) =>
        card.id === current ? (
          <li
            key={card.id}
            aria-current="true"
            className="rounded-card border border-hairline-2 bg-surface-2 px-3 py-2.5"
          >
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <Build card={card} />
              </div>
              <Pill variant={modified ? 'warn' : 'accent'}>
                {modified ? 'modified' : 'current'}
              </Pill>
            </div>
            {modified && (
              <RunButton className="mt-2.5" onClick={onRestore}>
                <RotateCcw className="h-3.5 w-3.5" />
                Restore defaults
              </RunButton>
            )}
          </li>
        ) : (
          <li key={card.id}>
            <button
              type="button"
              onClick={() => onSelect(card.id)}
              className={`w-full rounded-card border border-hairline bg-surface px-3 py-2.5 text-left transition-colors hover:border-hairline-2 hover:bg-surface-2 ${CONTROL_FOCUS}`}
            >
              <Build card={card} />
            </button>
          </li>
        )
      )}
    </ul>
  );
}
