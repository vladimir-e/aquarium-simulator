import React, { useState } from 'react';
import { X } from 'lucide-react';
import { ailingPlants, type AlgaeRow, type PlantRow, type Status } from '../../run';
import { Breakdown, RATE_EPSILON, rateText, rateTone } from '../run/Breakdown';
import { Card, CardBody, CardHeader } from '../run/Card';
import { Bar, Caret, statusText } from '../run/elements';

function VitalRow({
  name,
  figure,
  rate,
  invert = false,
  word,
  status,
  value,
  expanded,
  onToggle,
  children,
}: {
  name: string;
  figure: React.ReactNode;
  rate: number;
  invert?: boolean;
  word: string;
  status: Status;
  /** Bar fill, 0–100. */
  value: number;
  expanded: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}): React.JSX.Element {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex min-h-[44px] w-full items-center gap-2.5 rounded py-1 pr-1 text-left transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
      >
        <Caret open={expanded} />
        <span className="truncate text-[15px] font-medium text-ink">{name}</span>
        <span className="font-mono text-[12px] tabular-nums text-ink-3">{figure}</span>
        {Math.abs(rate) >= RATE_EPSILON && (
          <span
            className={`hidden font-mono text-[12px] tabular-nums sm:inline ${rateTone(rate, invert)}`}
          >
            {rateText(rate, 1)}
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-2.5">
          <span className={`text-[12px] ${statusText(status)}`}>{word}</span>
          <Bar className="w-20 sm:w-[130px]" value={value} status={status} />
        </span>
      </button>
      {expanded && children}
    </div>
  );
}

export function PlantsCard({
  rows,
  algae,
  maxPlants,
  overTrim,
  onRemove,
  footer,
  className = '',
}: {
  rows: PlantRow[];
  algae: AlgaeRow;
  maxPlants: number;
  /** Plants every rung of the trim ladder would cut. */
  overTrim: number;
  onRemove: (plantId: string) => void;
  /** The add-plant control, when it belongs in the list rather than the header. */
  footer?: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string): void =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const ailing = ailingPlants(rows).length;
  const clauses = [`${rows.length} of ${maxPlants} slots`];
  if (ailing > 0) clauses.push(`${ailing} ailing`);
  if (overTrim > 0) clauses.push(`${overTrim} to trim`);

  return (
    <Card className={`min-h-0 ${className}`}>
      <CardHeader title="Plants" meta={<span>{clauses.join(' · ')}</span>} />
      <CardBody className="min-h-0 lg:overflow-y-auto">
        <div className="divide-y divide-hairline">
          {rows.length === 0 && (
            <p className="py-4 text-[13px] text-ink-3">No plants yet — add one to begin.</p>
          )}
          {rows.map((row) => (
            <VitalRow
              key={row.id}
              name={row.name}
              figure={
                <>
                  {row.size.toFixed(0)} %
                  {row.overTrim && <span className="ml-1.5 text-accent">trim</span>}
                </>
              }
              rate={row.net}
              word={row.word}
              status={row.status}
              value={row.condition}
              expanded={expanded.has(row.id)}
              onToggle={() => toggle(row.id)}
            >
              <Breakdown stressors={row.stressors} benefits={row.benefits} net={row.net} />
              <div className="flex justify-end pb-2 pr-1">
                <button
                  type="button"
                  onClick={() => onRemove(row.id)}
                  aria-label={`Remove ${row.name}`}
                  className="flex items-center gap-1 rounded text-[12px] text-ink-3 transition-colors hover:text-alert focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  <X className="h-3.5 w-3.5" />
                  remove plant
                </button>
              </div>
            </VitalRow>
          ))}
        </div>

        <div className="border-t border-hairline-2">
          <VitalRow
            name="Algae"
            figure={`${Math.round(algae.mass)} %`}
            rate={algae.net}
            invert
            word={algae.word}
            status={algae.status}
            value={algae.mass}
            expanded={expanded.has('algae')}
            onToggle={() => toggle('algae')}
          >
            <Breakdown
              stressors={algae.stressors}
              benefits={algae.benefits}
              net={algae.net}
              invert
            />
          </VitalRow>
        </div>

        {footer && <div className="flex border-t border-hairline py-2">{footer}</div>}
      </CardBody>
    </Card>
  );
}
