import React, { useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import type { Action, Clutch, Fish, FishSpecies, SimulationState } from '../../../simulation/index.js';
import {
  FISH_SPECIES_DATA,
  SATIATION_BAND_LABEL,
  classifySatiationBandPosition,
  type SatiationBand,
} from '../../../simulation/index.js';
import { FoodResource } from '../../../simulation/resources/index.js';
import type { LivestockConfig } from '../../../simulation/config/livestock.js';
import { bandStatus, countHungry, groupBySpecies, groupFryBatches } from '../../run';
import { useCardCollapse } from '../../hooks/useCardCollapse';
import { Card, CardBody, CardFooter, CardHeader, CollapseRegion } from './Card';
import { Bar, Caret, Pill, statusText } from './elements';
import { SplitButton, type SplitOption } from './SplitButton';

const FEED_PRESETS = [0.25, 0.5, 1, 2];
const SEX_GLYPH: Record<Fish['sex'], string> = { male: '♂', female: '♀' };

interface LivestockCardProps {
  state: SimulationState;
  config: LivestockConfig;
  executeAction: (action: Action) => void;
}

type Grouping = 'species' | 'individuals';

/** Satiation state marker: a pill when it needs attention, plain word otherwise. */
function StateBadge({ band }: { band: SatiationBand }): React.JSX.Element {
  const status = bandStatus(band);
  const label = SATIATION_BAND_LABEL[band].toLowerCase();
  if (status === 'warn' || status === 'alert') {
    return <Pill variant={status}>{label}</Pill>;
  }
  return <span className={`text-[12px] ${statusText(status)}`}>{label}</span>;
}

function IndividualRow({
  fish,
  config,
  showSpecies,
  onRemove,
}: {
  fish: Fish;
  config: LivestockConfig;
  showSpecies: boolean;
  onRemove: () => void;
}): React.JSX.Element {
  const band = classifySatiationBandPosition(fish.satiation, config).band;
  return (
    <div className="flex items-center gap-3 py-1.5 text-[13px]">
      <span className="w-4 text-center text-ink-3">{SEX_GLYPH[fish.sex]}</span>
      {showSpecies && <span className="text-ink">{FISH_SPECIES_DATA[fish.species].name}</span>}
      <span className="w-12 font-mono tabular-nums text-ink-2">{fish.mass.toFixed(1)}g</span>
      <Bar className="w-20" value={fish.satiation} status={bandStatus(band)} />
      <span className="w-9 font-mono tabular-nums text-ink">{Math.round(fish.satiation)}%</span>
      <span className="ml-auto flex items-center gap-2">
        <StateBadge band={band} />
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${FISH_SPECIES_DATA[fish.species].name}`}
          className="rounded p-0.5 text-ink-3 transition-colors hover:text-alert focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </span>
    </div>
  );
}

/** Egg clutch waiting to hatch — inert until laidTick + hatchTime, no action. */
function ClutchRow({ clutch, tick }: { clutch: Clutch; tick: number }): React.JSX.Element {
  const data = FISH_SPECIES_DATA[clutch.species];
  const remaining = Math.max(0, clutch.laidTick + data.breeding.hatchTime - tick);
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="w-3.5" />
      <span className="text-[15px] font-medium text-ink">{data.name} clutch</span>
      <span className="text-[13px] text-ink-3">{clutch.eggCount} eggs</span>
      <Pill variant="neutral">eggs</Pill>
      <span className="ml-auto text-[12px] text-ink-3">
        {remaining > 0 ? `hatches in ${remaining}h` : 'hatching…'}
      </span>
    </div>
  );
}

export function LivestockCard({ state, config, executeAction }: LivestockCardProps): React.JSX.Element {
  const { collapsed, toggle, showToggle } = useCardCollapse('run.livestock');
  const [grouping, setGrouping] = useState<Grouping>('species');
  const [expanded, setExpanded] = useState<Set<FishSpecies>>(new Set());
  const [feedAmount, setFeedAmount] = useState(0.5);

  const fish = state.fish;
  const clutches = state.clutches;
  const food = state.resources.food;
  const totalHungry = countHungry(fish, config);
  const species = groupBySpecies(fish, config);
  const fryBatches = groupFryBatches(fish);

  const feed = (amount: number): void => executeAction({ type: 'feed', amount });
  const removeFish = (id: string): void => executeAction({ type: 'removeFish', fishId: id });
  const sellFry = (): void => executeAction({ type: 'sellFry' });

  const toggleSpecies = (s: FishSpecies): void =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  const feedOptions: SplitOption[] = FEED_PRESETS.map((amount) => ({
    key: String(amount),
    label: `${amount} g`,
    onSelect: (): void => {
      setFeedAmount(amount);
      feed(amount);
    },
  }));

  const hint =
    totalHungry > 0
      ? `${totalHungry} hungry — feed to clear`
      : food > 0.001
        ? 'feeding — food settling'
        : 'all fed';

  const header = (
    <CardHeader
      title="Livestock"
      collapsible={showToggle}
      collapsed={collapsed}
      onToggle={toggle}
      meta={
        <>
          <span className="font-mono tabular-nums text-ink-2">{fish.length}</span>
          {totalHungry > 0 && <Pill variant="warn">{totalHungry} hungry</Pill>}
        </>
      }
      action={
        <div className="relative">
          <select
            value={grouping}
            onChange={(e) => setGrouping(e.target.value as Grouping)}
            aria-label="Group livestock"
            className="appearance-none rounded-control border border-hairline bg-surface py-1 pl-2.5 pr-7 text-[13px] font-medium text-ink-2 transition-colors hover:border-hairline-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <option value="species">group: species</option>
            <option value="individuals">group: individuals</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3" />
        </div>
      }
    />
  );

  return (
    <Card className="lg:min-h-[520px]">
      {header}
      <CollapseRegion collapsed={collapsed}>
      <CardBody>
        {fish.length === 0 && clutches.length === 0 ? (
          <p className="py-6 text-[13px] text-ink-3">No livestock yet — add fish in Build.</p>
        ) : (
          <>
            {fish.length > 0 && grouping === 'individuals' && (
              <div className="max-h-[440px] divide-y divide-hairline overflow-y-auto">
                {fish.map((f) => (
                  <IndividualRow
                    key={f.id}
                    fish={f}
                    config={config}
                    showSpecies
                    onRemove={() => removeFish(f.id)}
                  />
                ))}
              </div>
            )}
            {fish.length > 0 && grouping === 'species' && (
              <div className="divide-y divide-hairline">
                {species.map((group) => {
                  const open = expanded.has(group.species);
                  return (
                    <div key={group.species}>
                      <button
                        type="button"
                        onClick={() => toggleSpecies(group.species)}
                        aria-expanded={open}
                        className={`flex w-full items-center gap-3 rounded py-2.5 text-left transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${open ? 'bg-surface-2' : ''}`}
                      >
                        <Caret open={open} />
                        <span className="text-[15px] font-medium text-ink">{group.name}</span>
                        <span className="text-[13px] text-ink-3">×{group.count}</span>
                        <span className="ml-auto flex items-center gap-3">
                          {group.hungryCount > 0 ? (
                            <span className="text-[12px] text-warn-text">{group.hungryCount} hungry</span>
                          ) : (
                            <span className={`text-[12px] ${statusText(bandStatus(group.band))}`}>
                              {SATIATION_BAND_LABEL[group.band].toLowerCase()}
                            </span>
                          )}
                          <Bar className="w-24" value={group.avgSatiation} status={bandStatus(group.band)} />
                          <span className="w-9 font-mono tabular-nums text-[13px] text-ink">
                            {Math.round(group.avgSatiation)}%
                          </span>
                        </span>
                      </button>
                      {open && (
                        <div className="max-h-[180px] overflow-y-auto pb-1 pl-6">
                          {group.fish.map((f) => (
                            <IndividualRow
                              key={f.id}
                              fish={f}
                              config={config}
                              showSpecies={false}
                              onRemove={() => removeFish(f.id)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {fryBatches.map((batch) => (
                  <div key={`fry-${batch.species}`} className="flex items-center gap-3 py-2.5">
                    <span className="w-3.5" />
                    <span className="text-[15px] font-medium text-ink">{batch.name} fry</span>
                    <span className="text-[13px] text-ink-3">×{batch.count}</span>
                    <Pill variant="neutral">batch</Pill>
                    <span className="ml-auto flex items-center gap-3">
                      <span className="text-[12px] text-ink-3">
                        day {batch.dayNow} · graduates d{batch.graduationDay}
                      </span>
                      <Bar className="w-24" value={batch.growthPct} status="warn" />
                      <span className="w-9 font-mono tabular-nums text-[13px] text-ink">
                        {Math.round(batch.growthPct)}%
                      </span>
                      <button
                        type="button"
                        onClick={sellFry}
                        className="text-[12px] text-ink-3 transition-colors hover:text-ink-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                      >
                        sell
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}
            {clutches.length > 0 && (
              <div
                className={`divide-y divide-hairline ${fish.length > 0 ? 'border-t border-hairline' : ''}`}
              >
                {clutches.map((c) => (
                  <ClutchRow key={c.id} clutch={c} tick={state.tick} />
                ))}
              </div>
            )}
          </>
        )}
      </CardBody>
      </CollapseRegion>

      <CardFooter>
        <SplitButton
          label={`Feed ${feedAmount}g`}
          variant="primary"
          onMain={() => feed(feedAmount)}
          options={feedOptions}
          ariaLabel={`Feed ${feedAmount} grams`}
        />
        <div className="flex items-center gap-2 text-[13px] text-ink-3">
          <span>in water</span>
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-track">
            <div
              className="h-full rounded-full bg-ink-3"
              style={{ width: `${Math.min(food / 2, 1) * 100}%` }}
            />
          </div>
          <span className="font-mono tabular-nums text-ink-2">{FoodResource.format(food)}</span>
        </div>
        <span className="ml-auto text-[12px] text-ink-3">{hint}</span>
      </CardFooter>
    </Card>
  );
}
