import React from 'react';
import type { NutrientDemand } from '../../../simulation/index.js';
import {
  formatDose,
  type DoseAdvice,
  type NutrientAlert,
  type NutrientDelta,
  type NutrientReading,
} from '../../run';
import { Card, CardBody, CardHeader } from '../run/Card';
import { Bar, Pill, statusText } from '../run/elements';

function list(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function NutrientsCard({
  readings,
  alert,
  demand,
  perMl,
  cover,
}: {
  readings: NutrientReading[];
  alert: NutrientAlert | null;
  demand: NutrientDemand | null;
  perMl: NutrientDelta[];
  /** Dose that clears every shortfall, or null when nothing is short. */
  cover: DoseAdvice | null;
}): React.JSX.Element {
  const short = readings.filter((r) => r.limiting).map((r) => r.label);

  return (
    <Card className="shrink-0">
      <CardHeader
        title="Nutrients"
        meta={<span>ppm · {demand ? `${demand} demand` : 'no plants drawing'}</span>}
        action={alert && <Pill variant={alert.status === 'alert' ? 'alert' : 'warn'}>{alert.text}</Pill>}
      />
      <CardBody className="py-2">
        <div className="divide-y divide-hairline">
          {readings.map((reading) => (
            <div key={reading.key} className="flex min-h-[34px] items-center gap-2.5">
              <span className="w-8 shrink-0 text-[12px] text-ink-2">{reading.label}</span>
              <Bar className="min-w-[40px] flex-1" value={reading.fill * 100} status={reading.status} />
              <span
                className={`w-12 shrink-0 text-right font-mono text-[12px] tabular-nums ${
                  reading.status === 'warn' || reading.status === 'alert'
                    ? statusText(reading.status)
                    : 'text-ink'
                }`}
              >
                {reading.text}
              </span>
              <span className="w-[68px] shrink-0 text-right font-mono text-[11px] text-ink-3">
                needs {reading.neededText}
              </span>
            </div>
          ))}
        </div>

        <div className="space-y-1 border-t border-hairline pt-2">
          {cover && (
            <p className="text-[12px] text-warn-text">
              {cover.ml} ml covers {list(short)}
              {cover.overSingleDose ? ' — more than one dose.' : '.'}
            </p>
          )}
          <p className="font-mono text-[11px] leading-relaxed text-ink-3">
            1 ml adds {formatDose(perMl)}
          </p>
        </div>
      </CardBody>
    </Card>
  );
}
