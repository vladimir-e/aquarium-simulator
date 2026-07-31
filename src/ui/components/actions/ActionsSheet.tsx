import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { TunableConfig } from '../../../simulation/config/index.js';
import type { SimulationState } from '../../../simulation/index.js';
import {
  verbDetail,
  verbRows,
  type PreviewRow,
  type VerbDetail,
  type VerbId,
  type VerbOption,
  type VerbRow,
} from '../../actions';
import type { ActionsSheet as SheetState } from '../../hooks/useActionsSheet';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { useUnits } from '../../hooks/useUnits';
import type { Status } from '../../run';
import { EmptyState } from '../run/Card';
import { FieldLabel } from '../run/elements';
import { CONTROL_FOCUS } from '../ui/focus';

const AFTER_COLOR: Record<Status, string> = {
  neutral: 'text-ink',
  ok: 'text-ink',
  warn: 'text-warn-text',
  alert: 'text-alert-text',
};

function VerbRowButton({
  row,
  selected,
  drills,
  onSelect,
}: {
  row: VerbRow;
  selected: boolean;
  drills: boolean;
  onSelect: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      data-verb={row.id}
      onClick={onSelect}
      aria-pressed={drills ? undefined : selected}
      className={`flex shrink-0 items-center gap-1.5 overflow-hidden rounded-control border px-2 text-left transition-colors ${
        drills ? 'h-[46px]' : 'h-11'
      } ${CONTROL_FOCUS} ${
        selected ? 'border-accent bg-accent-tint' : 'border-hairline-2 bg-surface hover:border-ink-3'
      }`}
    >
      <span
        className={`truncate text-[11.5px] font-semibold ${selected ? 'text-accent' : 'text-ink'}`}
      >
        {row.name}
      </span>
      <span
        className={`ml-auto truncate font-mono text-[10.5px] ${row.blocked ? 'text-warn-text' : 'text-ink-3'}`}
      >
        {row.value}
      </span>
      {drills && <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-ink-3" />}
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
    <div
      data-reading={row.key}
      className="flex min-h-[21px] flex-wrap items-center gap-x-1.5 text-[11.5px]"
    >
      <span className="w-[54px] shrink-0 truncate text-ink-2">{row.label}</span>
      <span className="font-mono tabular-nums text-ink-3">{row.before}</span>
      <ArrowRight aria-hidden className="h-3 w-3 shrink-0 text-ink-3" />
      <span className="sr-only">to</span>
      <span
        className={`font-mono text-[12px] font-semibold tabular-nums ${AFTER_COLOR[row.status]}`}
      >
        {row.after}
      </span>
      {row.unit && <span className="font-mono text-[10.5px] text-ink-3">{row.unit}</span>}
      {row.note && <span className="ml-auto pl-2 text-[10px] text-ink-3">{row.note}</span>}
    </div>
  );
}

/**
 * One verb's settings step. The same content on either form factor; only the
 * dismissal differs — the tablet keeps Cancel beside the commit, the phone has
 * ✕ in the header and would only make "which one goes back?" a question.
 */
function VerbSettings({
  detail,
  sheet,
  onCancel,
}: {
  detail: VerbDetail;
  sheet: SheetState;
  onCancel: (() => void) | null;
}): React.JSX.Element {
  const { setting } = detail;

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-baseline gap-x-2 pb-[9px]">
        <h2 className="text-[15px] font-semibold">{detail.title}</h2>
        <span className="text-[11px] text-ink-3">{detail.meta}</span>
      </div>

      <div className="shrink-0">
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
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pt-[13px]">
        <FieldLabel>At commit</FieldLabel>
        {detail.preview.length === 0 ? (
          <EmptyState className="pt-1">Nothing moves — the tank is already there.</EmptyState>
        ) : (
          <div className="pt-1">
            {detail.preview.map((row) => (
              <PreviewLine key={row.key} row={row} />
            ))}
          </div>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 pt-2.5">
        <button
          type="button"
          disabled={detail.blocked !== null}
          onClick={() => sheet.commit(detail.id)}
          className={`flex h-11 items-center justify-center rounded-control bg-accent px-4 text-[13.5px] font-semibold text-surface transition-[transform,opacity] active:scale-[0.99] disabled:opacity-40 motion-reduce:transition-none ${
            onCancel ? 'flex-1' : 'w-full'
          } ${CONTROL_FOCUS}`}
        >
          {detail.commitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className={`h-11 shrink-0 rounded-control border border-hairline-2 px-3 text-[13px] text-ink-2 transition-colors hover:text-ink ${CONTROL_FOCUS}`}
          >
            Cancel
          </button>
        )}
        {detail.blocked && <span className="text-[11px] text-warn-text">{detail.blocked}</span>}
      </div>
    </>
  );
}

interface ActionsSheetProps {
  sheet: SheetState;
  state: SimulationState;
  config: TunableConfig;
}

/**
 * The one husbandry surface: six verbs, their settings, and what the engine says
 * each will do. Where the rail stands it is a card floating over the rail's own
 * foot, master beside detail; on a phone the two are one screen at a time and
 * the rows drill in. Transient either way — anything outside it, Escape, Cancel
 * or a commit puts it away, and every setting survives to the next open.
 */
export function ActionsSheet({ sheet, state, config }: ActionsSheetProps): React.JSX.Element {
  const { unitSystem } = useUnits();
  const drillIn = useIsMobile();
  const [drilled, setDrilled] = useState(false);
  const trap = useFocusTrap(true);

  const rows = useMemo(
    () => verbRows(state, sheet.settings, unitSystem),
    [state, sheet.settings, unitSystem]
  );
  const detail = useMemo(
    () => verbDetail(state, sheet.selected, sheet.settings, unitSystem, config),
    [state, sheet.selected, sheet.settings, unitSystem, config]
  );

  const { close, select, selected } = sheet;
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    return (): void => window.removeEventListener('keydown', onKeyDown);
  }, [close]);

  // Back is a pop, so focus lands on the row that drilled in rather than nowhere.
  const drilledFrom = useRef<VerbId | null>(null);
  useEffect(() => {
    const from = drilledFrom.current;
    drilledFrom.current = drilled ? selected : null;
    if (drilled || from === null) return;
    trap.current?.querySelector<HTMLElement>(`[data-verb="${from}"]`)?.focus();
  }, [drilled, selected, trap]);

  const scrim = <div aria-hidden onClick={close} className="fixed inset-0 z-20 bg-ink/30" />;

  const list = (
    <div
      role="group"
      aria-label="Verbs"
      className={`flex flex-col ${drillIn ? 'gap-1.5' : 'gap-1 pt-1.5'}`}
    >
      {rows.map((row) => (
        <VerbRowButton
          key={row.id}
          row={row}
          drills={drillIn}
          selected={!drillIn && row.id === selected}
          onSelect={() => {
            select(row.id);
            setDrilled(true);
          }}
        />
      ))}
    </div>
  );

  if (drillIn) {
    return (
      <>
        {scrim}
        <div
          ref={trap}
          role="dialog"
          aria-modal="true"
          aria-label="Actions"
          className="fixed inset-x-0 bottom-0 z-30 flex max-h-[85dvh] flex-col rounded-t-sheet border-t border-hairline-2 bg-surface p-2.5 shadow-[0_-12px_34px_rgba(34,37,34,0.22)]"
        >
          <div className="mb-2 flex h-[34px] shrink-0 items-center gap-2">
            {drilled ? (
              <button
                type="button"
                onClick={() => setDrilled(false)}
                className={`flex h-[34px] items-center gap-1 rounded-control border border-hairline-2 pl-1.5 pr-2.5 text-[12.5px] font-semibold text-ink-2 transition-colors hover:text-ink ${CONTROL_FOCUS}`}
              >
                <ChevronLeft aria-hidden className="h-4 w-4 text-ink-3" />
                Actions
              </button>
            ) : (
              <FieldLabel>Actions</FieldLabel>
            )}
            <button
              type="button"
              aria-label="Close actions"
              onClick={close}
              className={`ml-auto flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-control border border-hairline-2 text-ink-2 transition-colors hover:text-ink ${CONTROL_FOCUS}`}
            >
              <X aria-hidden className="h-4 w-4" />
            </button>
          </div>

          {drilled ? (
            <VerbSettings detail={detail} sheet={sheet} onCancel={null} />
          ) : (
            <div className="min-h-0 overflow-y-auto">{list}</div>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      {scrim}
      <div
        ref={trap}
        role="dialog"
        aria-modal="true"
        aria-label="Actions"
        className="fixed bottom-3 left-3 z-30 flex h-[380px] w-[604px] overflow-hidden rounded-sheet border border-hairline-2 bg-surface shadow-[0_16px_44px_rgba(34,37,34,0.26)]"
      >
        <div className="flex w-[196px] shrink-0 flex-col border-r border-hairline bg-surface-2 p-2">
          <div className="px-1">
            <FieldLabel>Actions</FieldLabel>
          </div>
          {list}
          <p className="mt-auto px-1 pt-2 font-mono text-[10px] text-ink-3">
            ⌘K anywhere · Esc closes
          </p>
        </div>

        <div className="flex min-w-0 flex-1 flex-col px-3 py-2.5">
          <VerbSettings detail={detail} sheet={sheet} onCancel={close} />
        </div>
      </div>
    </>
  );
}
