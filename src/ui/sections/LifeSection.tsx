import React, { useCallback, useMemo } from 'react';
import type { FishSpecies, PlantSpecies } from '../../simulation/index.js';
import type { TunableConfig } from '../../simulation/config/index.js';
import { useStage } from '../components/layout/AppShell';
import { ModuleGroup, ModulePage } from '../components/layout/ModulePage';
import { AddDrawer } from '../components/life/AddDrawer';
import { AddMenu } from '../components/life/AddMenu';
import { LedgerDrawer } from '../components/life/LedgerDrawer';
import { Roster, RosterEmpty, type RosterHandlers } from '../components/life/roster';
import { ReadingRow } from '../components/ui/ReadingRow';
import { VerbButton } from '../components/ui/VerbButton';
import { bioload, bioloadNote, type PickerKind } from '../build';
import { useExpandedRows } from '../hooks/useExpandedRows';
import { useInspector } from '../hooks/useInspector';
import { useQueryParam } from '../hooks/useQueryParam';
import type { useSimulation } from '../hooks/useSimulation';
import { useReadingBook } from '../hooks/useReadingBook';
import { useUnits } from '../hooks/useUnits';
import { toneOf } from '../readings';
import {
  floorPlanted,
  inspection,
  readLedger,
  rosterSummary,
  rosterTables,
} from '../run';

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * Which picker is open is a route, so the Act palette can open one from
 * anywhere; so is what the ledger is open on, so the Overview can open one.
 */
const PICKERS: PickerKind[] = ['fish', 'plant'];

/** Bioload is read against the guideline, on a track that runs to twice it. */
const BIOLOAD_SCALE = 2;

/**
 * Who lives here: two tables read the same way, the blooms riding along at the
 * top of the plants as the populations they compete with them as. A fish species
 * opens to its fish, a plant species to its families and a family to its
 * units; any row opens the vitality ledger beside it.
 */
export function LifeSection({
  sim,
  config,
}: {
  sim: ReturnType<typeof useSimulation>;
  config: TunableConfig;
}): React.JSX.Element {
  const { onAct, actLabel } = useStage();
  const { unitSystem } = useUnits();
  const { state } = sim;
  const [expanded, toggle] = useExpandedRows(sim.tankId);
  const [inspect, setInspect] = useQueryParam<string>('inspect');
  const [picker, setAdding] = useQueryParam<PickerKind>('add');
  const adding = PICKERS.find((kind) => kind === picker) ?? null;
  const closeLedger = useCallback(() => setInspect(null), [setInspect]);
  const closePicker = useCallback(() => setAdding(null), [setAdding]);

  const book = useReadingBook(sim, config);
  const inspecting = useMemo(
    () => (inspect === null ? null : inspection(inspect, book.roster)),
    [inspect, book.roster]
  );
  useInspector(inspecting !== null, closeLedger);
  useInspector(adding !== null, closePicker);

  const tables = useMemo(
    () =>
      rosterTables(
        {
          fish: book.roster.fish,
          plants: book.roster.plants,
          fry: book.roster.fry,
          clutches: state.clutches,
          tick: state.tick,
        },
        expanded
      ),
    [book.roster, state, expanded]
  );

  const load = useMemo(() => bioload(state.fish, state.tank.capacity), [state]);
  const ledger = useMemo(
    () =>
      inspecting && readLedger(state, config, book.ahead, inspecting.target, inspecting.subtitle),
    [inspecting, state, config, book.ahead]
  );

  const { algae } = book.roster;

  const handlers = (kind: 'fish' | 'plant'): RosterHandlers => ({
    onToggle: toggle,
    onInspect: (row) => setInspect(row.key),
    onRemove: (id) =>
      sim.executeAction(
        kind === 'fish' ? { type: 'removeFish', fishId: id } : { type: 'removePlant', plantId: id }
      ),
    onSellFry: () => sim.executeAction({ type: 'sellFry' }),
    onTrimFamily: (familyId) => onAct('trimPlants', undefined, { familyId }),
  });

  const add = (species: FishSpecies | PlantSpecies, count: number): void => {
    for (let i = 0; i < count; i++) {
      sim.executeAction(
        adding === 'fish'
          ? { type: 'addFish', species: species as FishSpecies }
          : { type: 'addPlant', species: species as PlantSpecies }
      );
    }
    setAdding(null);
  };

  const remove = (): void => {
    if (!inspecting || inspecting.target.kind === 'algae') return;
    const { kind, id } = inspecting.target;
    sim.executeAction(
      kind === 'fish' ? { type: 'removeFish', fishId: id } : { type: 'removePlant', plantId: id }
    );
    setInspect(null);
  };

  return (
    <>
      <ModulePage
        title="Life"
        meta={[
          `${state.fish.length} fish`,
          plural(state.plants.length, 'plant'),
          ...algae.map((row) => `${row.name.toLowerCase()} ${row.figure}`),
        ].join(' · ')}
        actions={
          <>
            <VerbButton label={actLabel('feed')} onClick={() => onAct('feed')} />
            <VerbButton label={actLabel('trimPlants')} onClick={() => onAct('trimPlants')} />
            <VerbButton label={actLabel('scrubAlgae')} onClick={() => onAct('scrubAlgae')} />
            <AddMenu onPick={setAdding} />
          </>
        }
      >
        <div className="flex flex-col gap-1">
          <ModuleGroup title="Fish" meta={rosterSummary(state)}>
            <Roster layout="fish" rows={tables.fish} handlers={handlers('fish')} />
            {tables.fish.length === 0 && (
              <RosterEmpty
                species="neon_tetra"
                line="No fish yet"
                verb="Add fish"
                onAdd={() => setAdding('fish')}
              />
            )}
            <ReadingRow
              name="Bioload"
              value={load.ratio.toFixed(1)}
              unit="×"
              at={Math.min(1, load.ratio / BIOLOAD_SCALE)}
              band={{ from: 0, to: 1 / BIOLOAD_SCALE }}
              tone={toneOf(load.status)}
              note={bioloadNote(load, unitSystem)}
            />
          </ModuleGroup>

          <ModuleGroup title="Plants" meta={floorPlanted(state)}>
            <Roster layout="plants" rows={[...algae, ...tables.plants]} handlers={handlers('plant')} />
            {tables.plants.length === 0 && (
              <RosterEmpty
                species="anubias"
                line="No plants yet"
                verb="Add plant"
                onAdd={() => setAdding('plant')}
              />
            )}
          </ModuleGroup>
        </div>
      </ModulePage>

      <LedgerDrawer
        ledger={ledger}
        onClose={closeLedger}
        onAct={onAct}
        actLabel={actLabel}
        onRemove={inspecting?.target.kind === 'algae' ? null : remove}
      />

      <AddDrawer
        key={adding}
        kind={adding}
        state={state}
        bed={book.bed}
        onClose={closePicker}
        onAdd={add}
      />
    </>
  );
}
