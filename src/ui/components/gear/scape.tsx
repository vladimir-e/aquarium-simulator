import React, { useState } from 'react';
import { X } from 'lucide-react';
import {
  checkHardscapeCapacity,
  getHardscapeName,
  getSubstrateSurface,
  type HardscapeType,
  type SubstrateType,
} from '../../../simulation/index.js';
import { SurfaceResource } from '../../../simulation/resources/index.js';
import type { useSimulation } from '../../hooks/useSimulation';
import {
  HARDSCAPE_TYPES,
  hardscapeRows,
  SUBSTRATE_NAME,
  SUBSTRATE_TYPES,
  substrateConsequence,
} from '../../build';
import { DRAWER_TOGGLE } from '../ui/Drawer';
import { Select } from '../ui/Select';

type Sim = ReturnType<typeof useSimulation>;

const ROW = 'grid h-11 items-center gap-2.5 border-t border-hairline first:border-t-0';
const SCAPE_ROW = `${ROW} grid-cols-[minmax(0,1fr)_88px_minmax(0,110px)_24px]`;

/** The pieces the tank has room for, one button deep. */
function AddHardscape({ onPick }: { onPick: (type: HardscapeType) => void }): React.JSX.Element {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as HTMLElement | null)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false);
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        {...DRAWER_TOGGLE}
        className="inline-flex h-7 shrink-0 items-center rounded-control border border-hairline px-2.5 text-[13px] text-ink transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
      >
        + Hardscape
      </button>

      {open && (
        <div className="absolute right-0 top-8 z-40 w-44 rounded-card border border-hairline bg-surface py-1 shadow-[var(--shadow-drawer)]">
          {HARDSCAPE_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => {
                setOpen(false);
                onPick(type);
              }}
              {...DRAWER_TOGGLE}
              className="flex h-9 w-full items-center px-3 text-left text-[13px] text-ink transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
            >
              + {getHardscapeName(type)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** What the tank is built of, under what runs in it: the surface both feed. */
export function ScapeRows({ sim }: { sim: Sim }): React.JSX.Element {
  const { equipment, tank } = sim.state;
  const substrate = equipment.substrate.type;
  const rows = hardscapeRows(equipment.hardscape.items);
  const capacity = checkHardscapeCapacity(equipment.hardscape.items, tank.hardscapeSlots);

  return (
    <div>
      <div className={SCAPE_ROW}>
        <span className="truncate text-[14px] text-ink">
          Substrate
          <span className="ml-2 hidden text-[13px] text-ink-3 md:inline">
            {substrateConsequence(substrate)}
          </span>
        </span>
        <span className="text-right text-[13px] tabular-nums text-ink-2">
          {SurfaceResource.format(getSubstrateSurface(substrate, tank.capacity))}
        </span>
        <Select
          className="col-span-2 justify-self-end w-[134px]"
          ariaLabel="Substrate"
          value={substrate}
          onChange={(value) => sim.updateSubstrateType(value as SubstrateType)}
          options={SUBSTRATE_TYPES.map((type) => ({ value: type, label: SUBSTRATE_NAME[type] }))}
        />
      </div>

      {rows.map((row) => (
        <div key={row.id} className={SCAPE_ROW}>
          <span className="truncate text-[14px] text-ink">{row.name}</span>
          <span className="text-right text-[13px] tabular-nums text-ink-2">
            {SurfaceResource.format(row.surface)}
          </span>
          <span className="truncate text-right text-[13px] text-ink-3">{row.effect ?? 'inert'}</span>
          <button
            type="button"
            onClick={() => sim.removeHardscapeItem(row.id)}
            aria-label={`Remove ${row.name}`}
            className="flex h-6 w-6 items-center justify-center justify-self-center rounded-control text-ink-3 transition-colors hover:text-alert focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      <div className="flex items-center gap-2.5 border-t border-hairline pt-2">
        {capacity.ok ? (
          <AddHardscape onPick={sim.addHardscapeItem} />
        ) : (
          <span className="text-[13px] text-ink-3">{capacity.message}</span>
        )}
      </div>
    </div>
  );
}
