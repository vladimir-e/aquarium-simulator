import React from 'react';
import { toneOf } from '../../readings';
import type { Ledger, LedgerFactor } from '../../run';
import { Drawer } from '../ui/Drawer';
import { RangeStrip, TONE_TEXT } from '../ui/RangeStrip';
import { ReadingRow } from '../ui/ReadingRow';
import { VerbButton } from '../ui/VerbButton';

function signed(value: number, sign: '+' | '−'): string {
  return `${sign}${Math.abs(value).toFixed(1)}`;
}

/**
 * One side of the ledger. The bar is each factor against the largest on the
 * page, so the two columns are read against each other rather than each
 * against itself — the point of the drawer is which side is winning.
 */
function Column({
  title,
  factors,
  total,
  sign,
  scale,
}: {
  title: string;
  factors: LedgerFactor[];
  total: number;
  sign: '+' | '−';
  scale: number;
}): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <h3 className="text-[11px] text-ink-3">{title}</h3>
      {factors.length === 0 && <p className="py-1 text-[13px] text-ink-3">nothing</p>}
      {factors.map((factor) => (
        <div key={factor.key} className="flex flex-col gap-1 py-1">
          <div className="flex items-baseline justify-between gap-2 text-[13px]">
            <span className="truncate text-ink-2">{factor.label}</span>
            <span className="shrink-0 tabular-nums text-ink">{signed(factor.perDay, sign)}</span>
          </div>
          <span className="block h-1 bg-surface-2">
            <span
              className="block h-1 bg-band"
              style={{ width: `${scale > 0 ? (factor.perDay / scale) * 100 : 0}%` }}
            />
          </span>
        </div>
      ))}
      <div className="mt-0.5 flex items-baseline justify-between border-t border-hairline pt-1 text-[13px]">
        <span className="text-ink-3">sum</span>
        <span className="tabular-nums text-ink-2">{signed(total, sign)}</span>
      </div>
    </div>
  );
}

/**
 * Why one organism is where it is: the condition it holds, what is buying that
 * and what is spending it, and the bank between the two. Every line is a
 * factor the tick charged — the drawer states the engine's ledger, it does not
 * compose one.
 */
export function LedgerDrawer({
  ledger,
  onClose,
  onAct,
  onRemove,
}: {
  ledger: Ledger | null;
  onClose: () => void;
  onAct: () => void;
  /** Absent for the algae, which is scrubbed rather than removed. */
  onRemove: (() => void) | null;
}): React.JSX.Element | null {
  if (!ledger) return null;

  const tone = toneOf(ledger.status);
  const heroTone = toneOf(ledger.valueStatus);
  const scale = Math.max(
    ...ledger.helping.map((factor) => factor.perDay),
    ...ledger.hurting.map((factor) => factor.perDay),
    0
  );

  return (
    <Drawer
      open
      onClose={onClose}
      title={ledger.title}
      meta={<span className={`text-[13px] ${TONE_TEXT[tone]}`}>{ledger.word}</span>}
    >
      <div className="flex flex-col gap-4 p-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline gap-1.5">
            <span className={`text-[28px] font-medium leading-8 tabular-nums ${TONE_TEXT[heroTone]}`}>
              {ledger.value}
            </span>
            <span className="text-[13px] text-ink-2">{ledger.unit}</span>
            <span className="ml-auto text-[13px] tabular-nums text-ink-2">{ledger.trend}</span>
          </div>
          <RangeStrip at={ledger.at} band={ledger.band} tone={heroTone} />
          {ledger.subtitle && <p className="text-[13px] text-ink-3">{ledger.subtitle}</p>}
        </div>

        {ledger.satiation && (
          <ReadingRow
            name="Satiation"
            value={Math.round(ledger.satiation.at * 100).toString()}
            unit="%"
            at={ledger.satiation.at}
            band={ledger.satiation.band}
            tone={toneOf(ledger.satiation.status)}
            note={ledger.satiation.word}
          />
        )}

        <div className="flex flex-col gap-3 border-t border-hairline pt-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <Column
              title="Helping"
              factors={ledger.helping}
              total={ledger.helps}
              sign="+"
              scale={scale}
            />
            <Column
              title="Hurting"
              factors={ledger.hurting}
              total={ledger.hurts}
              sign="−"
              scale={scale}
            />
          </div>
          <div className="flex items-baseline justify-between text-[13px]">
            <span className="text-ink-2">Net</span>
            <span className="tabular-nums text-ink">
              {signed(ledger.net, ledger.net < 0 ? '−' : '+')} per day
            </span>
          </div>
        </div>

        {ledger.bank && (
          <div className="border-t border-hairline pt-1">
            <ReadingRow
              name="Bank"
              value={ledger.bank.value.toFixed(1)}
              unit={`of ${ledger.bank.cap}`}
              at={ledger.bank.at}
              band={{ from: 0, to: 1 }}
              note={ledger.bank.note}
            />
          </div>
        )}

        {ledger.demand && (
          <p className="border-t border-hairline pt-3 text-[13px] text-ink-2">{ledger.demand}</p>
        )}

        <div className="flex items-center gap-1.5 border-t border-hairline pt-3">
          <VerbButton label={ledger.verb} onClick={onAct} />
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="ml-auto h-7 rounded-control px-2.5 text-[13px] text-ink-3 transition-colors hover:text-alert focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </Drawer>
  );
}
