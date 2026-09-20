import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SimulationState } from '../../../simulation/index.js';
import { BUILD_VERBS, verbRows, type VerbId, type VerbSettings } from '../../actions';
import { useUnits } from '../../hooks/useUnits';
import { Drawer } from '../ui/Drawer';

interface Entry {
  key: string;
  name: string;
  /** The amount the verb is standing on, or nothing for a verb that builds. */
  value: string;
  home: string;
  blocked: string | null;
  choose: () => void;
}

function Row({
  entry,
  active,
  onHover,
}: {
  entry: Entry;
  active: boolean;
  onHover: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      data-verb={entry.key}
      onClick={entry.choose}
      onMouseMove={onHover}
      className={`flex h-11 w-full items-center gap-2 border-t border-hairline px-3 text-left transition-colors first:border-t-0 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${
        active ? 'bg-surface-2' : ''
      }`}
    >
      <span className="shrink-0 text-[13px] font-medium text-ink">{entry.name}</span>
      {entry.blocked ? (
        <span className="min-w-0 truncate text-[13px] text-warn">{entry.blocked}</span>
      ) : (
        <span className="min-w-0 truncate text-[13px] tabular-nums text-ink-2">{entry.value}</span>
      )}
      <span className="ml-auto shrink-0 text-[12px] text-ink-3">{entry.home}</span>
    </button>
  );
}

/**
 * Every verb in one list: the six that keep the tank, each with the amount it
 * would use and the module it lives in, then the three that build it. Typing
 * filters; Enter takes the first match. The palette is a second route to a verb
 * that already has a home, never the only one.
 */
export function ActPalette({
  state,
  settings,
  onPick,
  onClose,
}: {
  state: SimulationState;
  settings: VerbSettings;
  onPick: (verb: VerbId) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { unitSystem } = useUnits();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const entries = useMemo((): Entry[] => {
    const husbandry = verbRows(state, settings, unitSystem).map((row) => ({
      key: row.id,
      name: row.name,
      value: row.value,
      home: row.home,
      blocked: row.blocked,
      choose: (): void => onPick(row.id),
    }));
    const build = BUILD_VERBS.map((verb) => ({
      key: verb.id,
      name: verb.name,
      value: '',
      home: verb.home,
      blocked: null,
      choose: (): void => {
        onClose();
        navigate(verb.to);
      },
    }));
    return [...husbandry, ...build];
  }, [state, settings, unitSystem, onPick, onClose, navigate]);

  const matches = entries.filter((entry) =>
    entry.name.toLowerCase().includes(query.trim().toLowerCase())
  );
  const at = Math.min(active, Math.max(0, matches.length - 1));

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((was) => {
        const next = was + (e.key === 'ArrowDown' ? 1 : -1);
        return Math.max(0, Math.min(matches.length - 1, next));
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      matches[at]?.choose();
    }
  };

  return (
    <Drawer open onClose={onClose} title="Act">
      <div onKeyDown={onKeyDown} className="flex flex-col">
        <div className="p-3">
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            aria-label="Filter verbs"
            placeholder="Filter verbs"
            className="h-8 w-full rounded-control border border-hairline bg-surface-2 px-2 text-[13px] text-ink placeholder:text-ink-3 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-accent"
          />
        </div>

        {matches.length === 0 ? (
          <p className="px-3 pb-3 text-[13px] text-ink-3">No verb answers to that.</p>
        ) : (
          <div className="border-t border-hairline">
            {matches.map((entry, i) => (
              <Row
                key={entry.key}
                entry={entry}
                active={i === at}
                onHover={() => setActive(i)}
              />
            ))}
          </div>
        )}
      </div>
    </Drawer>
  );
}
