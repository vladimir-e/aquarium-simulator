import React, { useCallback, useEffect, useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import type { TunableConfig } from '../../../simulation/config/index.js';
import type { SimulationState } from '../../../simulation/index.js';
import {
  verbDetail,
  type PreviewRow,
  type SettableVerb,
  type VerbId,
  type VerbSettings,
} from '../../actions';
import { useUnits } from '../../hooks/useUnits';
import { toneOf } from '../../readings';
import { Drawer, DRAWER_FOCUS } from '../ui/Drawer';
import { RangeStrip, TONE_TEXT } from '../ui/RangeStrip';
import { Segmented } from '../ui/Segmented';

/**
 * One reading the commit would move: the standing value, the value it would
 * leave, and both of them on the strip the reading is read on everywhere else
 * — the ghost marker where it stands, the live marker where it would go.
 */
function PreviewLine({ row }: { row: PreviewRow }): React.JSX.Element {
  const tone = toneOf(row.status);

  return (
    <div
      data-reading={row.key}
      className="grid h-9 grid-cols-[minmax(36px,auto)_minmax(104px,auto)_minmax(40px,1fr)] items-center gap-2.5 border-t border-hairline first:border-t-0"
    >
      <span className="truncate text-ink-2">{row.label}</span>
      <span className="flex items-baseline gap-1 text-[13px]">
        <span className="tabular-nums text-ink-3">{row.before}</span>
        <ArrowRight aria-hidden className="h-3 w-3 shrink-0 self-center text-ink-3" />
        <span className="sr-only">to</span>
        <span className={`text-[16px] font-medium leading-5 tabular-nums ${TONE_TEXT[tone]}`}>
          {row.after}
        </span>
        {row.unit && <span className="text-[12px] text-ink-2">{row.unit}</span>}
      </span>
      <span className="flex min-w-0 flex-col justify-center gap-1 pr-0.5">
        <RangeStrip at={row.to} ghost={row.from} band={row.band} tone={tone} />
        {row.note && <span className="truncate text-[11px] text-ink-3">{row.note}</span>}
      </span>
    </div>
  );
}

interface VerbDrawerProps {
  verb: VerbId | null;
  state: SimulationState;
  config: TunableConfig;
  settings: VerbSettings;
  onAmount: (verb: SettableVerb, value: number) => void;
  onCommit: (verb: VerbId) => void;
  onClose: () => void;
}

/**
 * The verb sheet: the amount, what it would do, and one button that says the
 * verb and the amount together. Every figure on it is the engine's — the rungs
 * are its own option sets, the preview is the state `applyAction` returns, and
 * a refusal stands where the commit would in the words the engine refused in.
 */
export function VerbDrawer({
  verb,
  state,
  config,
  settings,
  onAmount,
  onCommit,
  onClose,
}: VerbDrawerProps): React.JSX.Element | null {
  const { unitSystem } = useUnits();
  const detail = useMemo(
    () => (verb === null ? null : verbDetail(state, verb, settings, unitSystem, config)),
    [verb, state, settings, unitSystem, config]
  );

  const commit = useCallback((): void => {
    if (detail !== null && detail.blocked === null) onCommit(detail.id);
  }, [detail, onCommit]);

  // Enter commits the sheet, the way ⌘K opens the palette. A rung answers its
  // own Enter, and the × is the header's rather than the sheet's.
  useEffect(() => {
    if (verb === null) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      if (e.key !== 'Enter' || !target?.closest('[data-verb-sheet]')) return;
      if (target.closest('[data-rungs]')) return;
      e.preventDefault();
      commit();
    };
    document.addEventListener('keydown', onKeyDown);
    return (): void => document.removeEventListener('keydown', onKeyDown);
  }, [verb, commit]);

  if (detail === null) return null;

  const { setting } = detail;

  return (
    <Drawer open onClose={onClose} title={detail.title}>
      <div data-verb-sheet className="flex flex-col gap-4 p-3">
        <p className="text-[13px] text-ink-2">{detail.meta}</p>

        {setting && detail.options.length > 0 && (
          <div data-rungs className="flex flex-col gap-1.5">
            <h3 className="text-[11px] text-ink-3">{setting.label}</h3>
            <Segmented
              fill
              ariaLabel={setting.label}
              value={String(setting.value)}
              onChange={(value) => onAmount(setting.verb, Number(value))}
              options={detail.options.map((option) => ({
                value: String(option.value),
                disabled: option.disabled,
                label: (
                  <span className="flex flex-col items-center gap-0.5 py-0.5">
                    <span className="text-[13px] leading-none tabular-nums">{option.label}</span>
                    <span className="text-[10px] font-normal leading-none text-ink-3">
                      {option.hint}
                    </span>
                  </span>
                ),
              }))}
            />
          </div>
        )}

        {detail.note && <p className="text-[13px] text-ink-2">{detail.note}</p>}

        {detail.blocked === null && (
          <div className="flex flex-col gap-1.5">
            <h3 className="text-[11px] text-ink-3">After</h3>
            {detail.preview.length === 0 ? (
              <p className="py-1 text-[13px] text-ink-3">nothing moves</p>
            ) : (
              detail.preview.map((row) => <PreviewLine key={row.key} row={row} />)
            )}
          </div>
        )}

        {detail.blocked ? (
          <p className="flex min-h-9 items-center justify-center rounded-control border border-hairline px-3 text-center text-[13px] text-warn">
            {detail.blocked}
          </p>
        ) : (
          <button
            type="button"
            onClick={commit}
            {...DRAWER_FOCUS}
            className="flex h-9 items-center justify-center rounded-control bg-accent text-[13px] font-medium text-accent-ink transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {detail.commitLabel}
          </button>
        )}
      </div>
    </Drawer>
  );
}
