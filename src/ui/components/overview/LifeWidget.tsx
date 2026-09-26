import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SimulationState } from '../../../simulation/index.js';
import type { LivestockConfig } from '../../../simulation/config/livestock.js';
import type { VerbId } from '../../actions';
import type { ReadingBook, ReadingId } from '../../readings';
import { rosterTables } from '../../run';
import { Roster, type RosterHandlers } from '../life/roster';
import { VerbButton } from '../ui/VerbButton';
import { Widget } from '../ui/Widget';

interface LifeWidgetProps {
  book: ReadingBook;
  state: SimulationState;
  config: LivestockConfig;
  onOpenReading: (id: ReadingId) => void;
  onAct: (verb: VerbId) => void;
  actLabel: (verb: VerbId) => string;
}

/**
 * Who lives here and how they are doing — the module's own species rows, at
 * widget width: the name, the count and the condition of what it counts, with
 * the figures left to the page that has room for them.
 */
export function LifeWidget({
  book,
  state,
  config,
  onOpenReading,
  onAct,
  actLabel,
}: LifeWidgetProps): React.JSX.Element {
  const navigate = useNavigate();

  const rows = useMemo(
    () =>
      rosterTables(
        { fish: book.roster.fish, plants: book.roster.plants, fry: null, clutches: [], tick: 0 },
        config,
        new Set()
      ),
    [book.roster, config]
  );

  const handlers: RosterHandlers = {
    onToggle: () => navigate('/life'),
    onInspect: (row) =>
      row.kind === 'population'
        ? onOpenReading('algae')
        : navigate({ pathname: '/life', search: `?${new globalThis.URLSearchParams({ inspect: row.key })}` }),
    onRemove: () => navigate('/life'),
    onSellFry: () => navigate('/life'),
    onTrimFamily: () => navigate('/life'),
  };

  const empty = book.roster.fish.length === 0 && book.roster.plants.length === 0;

  return (
    <Widget
      title="Life"
      caption={`${state.fish.length} fish · ${state.plants.length} ${state.plants.length === 1 ? 'plant' : 'plants'}`}
      to="/life"
      footer={
        <>
          <VerbButton label={actLabel('feed')} onClick={() => onAct('feed')} />
          <VerbButton label={actLabel('trimPlants')} onClick={() => onAct('trimPlants')} />
          <VerbButton label={actLabel('scrubAlgae')} onClick={() => onAct('scrubAlgae')} />
          <VerbButton label="+ Add" onClick={() => navigate('/life')} className="ml-auto" />
        </>
      }
    >
      {empty && (
        <p className="py-3 text-[13px] text-ink-2">Nothing stocked yet — add fish or plants.</p>
      )}
      <Roster
        layout="widget"
        rows={[...rows.fish, book.roster.algae, ...rows.plants]}
        handlers={handlers}
      />
    </Widget>
  );
}
