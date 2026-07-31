import React, { useEffect, useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import type { TunableConfig } from '../../../simulation/config/index.js';
import type { SimulationState } from '../../../simulation/index.js';
import {
  verbDetail,
  verbTiles,
  type PreviewRow,
  type VerbOption,
  type VerbTile,
} from '../../actions';
import type { ActionsSheet as SheetState } from '../../hooks/useActionsSheet';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useUnits } from '../../hooks/useUnits';
import type { Status } from '../../run';
import { FieldLabel } from '../run/elements';
import { CONTROL_FOCUS } from '../ui/focus';

const AFTER_COLOR: Record<Status, string> = {
  neutral: 'text-ink',
  ok: 'text-ink',
  warn: 'text-warn-text',
  alert: 'text-alert-text',
};

function VerbTileButton({
  tile,
  selected,
  onSelect,
}: {
  tile: VerbTile;
  selected: boolean;
  onSelect: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex min-h-[46px] flex-col justify-center gap-0.5 overflow-hidden rounded-control border px-2 py-1 text-left transition-colors ${CONTROL_FOCUS} ${
        selected
          ? 'border-accent bg-accent-tint'
          : 'border-hairline-2 bg-surface hover:border-ink-3'
      }`}
    >
      <span
        className={`truncate text-[11.5px] font-semibold leading-none ${selected ? 'text-accent' : 'text-ink'}`}
      >
        {tile.name}
      </span>
      <span
        className={`truncate font-mono text-[10.5px] leading-tight ${tile.blocked ? 'text-warn-text' : 'text-ink-3'}`}
      >
        {tile.value}
      </span>
    </button>
  );
}

function OptionChip({
  option,
  selected,
  onSelect,
}: {
  option: VerbOption;
  selected: boolean;
  onSelect: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={option.disabled}
      aria-pressed={selected}
      className={`flex h-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-control border px-2.5 transition-colors disabled:opacity-40 ${CONTROL_FOCUS} ${
        selected
          ? 'border-accent bg-accent-tint'
          : 'border-hairline-2 bg-surface enabled:hover:border-ink-3'
      }`}
    >
      <span
        className={`font-mono text-[13px] font-semibold leading-none tabular-nums ${selected ? 'text-accent' : 'text-ink'}`}
      >
        {option.label}
      </span>
      <span
        className={`font-mono text-[9.5px] leading-none ${selected ? 'text-accent' : 'text-ink-3'}`}
      >
        {option.hint}
      </span>
    </button>
  );
}

function PreviewLine({ row }: { row: PreviewRow }): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 py-[3px] text-[11.5px]">
      <span className="w-14 shrink-0 truncate text-ink-2">{row.label}</span>
      <span className="font-mono tabular-nums text-ink-3">{row.before}</span>
      <ArrowRight aria-hidden className="h-3 w-3 shrink-0 self-center text-ink-3" />
      <span className="sr-only">to</span>
      <span className={`font-mono text-[12px] font-semibold tabular-nums ${AFTER_COLOR[row.status]}`}>
        {row.after}
      </span>
      {row.unit && <span className="font-mono text-[10.5px] text-ink-3">{row.unit}</span>}
      {row.note && (
        <span className="basis-full truncate pl-[62px] text-[10px] text-ink-3 md:ml-auto md:basis-auto md:pl-2">
          {row.note}
        </span>
      )}
    </div>
  );
}

interface ActionsSheetProps {
  sheet: SheetState;
  state: SimulationState;
  config: TunableConfig;
}

/**
 * The one husbandry surface: six verbs, their settings, and what the engine
 * says each will do — docked at the foot of the stage, over the explanation
 * rather than the instrument. Transient by design: anything outside it, Escape,
 * Cancel or a commit puts it away, and every setting survives to the next open.
 */
export function ActionsSheet({ sheet, state, config }: ActionsSheetProps): React.JSX.Element {
  const { unitSystem } = useUnits();
  const trap = useFocusTrap(true);

  const tiles = useMemo(
    () => verbTiles(state, sheet.settings, unitSystem),
    [state, sheet.settings, unitSystem]
  );
  const detail = useMemo(
    () => verbDetail(state, sheet.selected, sheet.settings, unitSystem, config),
    [state, sheet.selected, sheet.settings, unitSystem, config]
  );

  const { close } = sheet;
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    return (): void => window.removeEventListener('keydown', onKeyDown);
  }, [close]);

  // Two columns of preview read down, not across, so a column stays one topic.
  const previewRowCount = Math.max(1, Math.ceil(detail.preview.length / 2));
  const setting = detail.setting;

  return (
    <>
      <div aria-hidden onClick={close} className="fixed inset-0 z-20" />
      <div
        ref={trap}
        role="dialog"
        aria-label="Actions"
        className="fixed inset-x-0 bottom-0 z-30 flex max-h-[85dvh] flex-col overflow-hidden rounded-t-card border border-hairline-2 bg-surface shadow-2xl md:absolute md:max-h-[78%] md:flex-row md:rounded-card"
      >
        <div className="flex shrink-0 flex-col border-b border-hairline bg-surface-2 p-2 md:w-[196px] md:border-b-0 md:border-r">
          <FieldLabel>Actions</FieldLabel>
          <div
            role="group"
            aria-label="Verbs"
            className="mt-1.5 grid grid-cols-3 gap-1.5 md:grid-cols-2"
          >
            {tiles.map((tile) => (
              <VerbTileButton
                key={tile.id}
                tile={tile}
                selected={tile.id === sheet.selected}
                onSelect={() => sheet.select(tile.id)}
              />
            ))}
          </div>
          <p className="mt-auto hidden pt-2 font-mono text-[10px] text-ink-3 md:block">
            ⌘K anywhere · Esc closes
          </p>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col p-3">
          <div className="flex flex-wrap items-baseline gap-x-2 pb-2">
            <h2 className="text-[15px] font-semibold">{detail.title}</h2>
            <span className="text-[11px] text-ink-3">{detail.meta}</span>
          </div>

          <FieldLabel>{detail.optionsLabel}</FieldLabel>
          <div className="pt-1.5">
            {setting === null ? (
              <p className="max-w-[62ch] text-[12px] leading-snug text-ink-2">{detail.note}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {detail.options.map((option) => (
                  <OptionChip
                    key={option.value}
                    option={option}
                    selected={option.value === setting.value}
                    onSelect={() => sheet.setSetting(setting.verb, option.value)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pt-3">
            <FieldLabel>At commit</FieldLabel>
            {detail.preview.length === 0 ? (
              <p className="pt-1 text-[11.5px] text-ink-3">Nothing moves — the tank is already there.</p>
            ) : (
              <div
                className="pt-1 md:grid md:grid-flow-col md:grid-cols-2 md:gap-x-4"
                style={{ gridTemplateRows: `repeat(${previewRowCount}, auto)` }}
              >
                {detail.preview.map((row) => (
                  <PreviewLine key={row.key} row={row} />
                ))}
              </div>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2 pt-3">
            <button
              type="button"
              disabled={detail.blocked !== null}
              onClick={() => sheet.commit(detail.id)}
              className={`flex h-11 flex-1 items-center justify-center rounded-control bg-accent px-4 text-[13.5px] font-semibold text-surface transition-[transform,opacity] active:scale-[0.99] disabled:opacity-40 motion-reduce:transition-none md:flex-none md:min-w-[240px] ${CONTROL_FOCUS}`}
            >
              {detail.commitLabel}
            </button>
            <button
              type="button"
              onClick={close}
              className={`h-11 shrink-0 rounded-control border border-hairline-2 px-3 text-[13px] text-ink-2 transition-colors hover:text-ink ${CONTROL_FOCUS}`}
            >
              Cancel
            </button>
            {detail.blocked && (
              <span className="text-[11px] text-warn-text">{detail.blocked}</span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
