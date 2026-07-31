import React from 'react';
import { X } from 'lucide-react';
import { getSubstrateSurface, type SubstrateType } from '../../../simulation/index.js';
import { SurfaceResource } from '../../../simulation/resources/index.js';
import type { useSimulation } from '../../hooks/useSimulation';
import { hardscapeRows, SUBSTRATE_NAME, SUBSTRATE_TYPES, substrateConsequence } from '../../build';
import { Card, CardBody, CardHeader } from '../run/Card';
import { Select } from '../ui/Select';

type Sim = ReturnType<typeof useSimulation>;

export function ScapeCard({
  sim,
  footer,
}: {
  sim: Sim;
  /** The add-hardscape control, when it belongs in the card rather than the header. */
  footer?: React.ReactNode;
}): React.JSX.Element {
  const { equipment, tank, resources } = sim.state;
  const substrate = equipment.substrate.type;
  const rows = hardscapeRows(equipment.hardscape.items);

  return (
    <Card className="min-h-0 flex-1">
      <CardHeader
        title="Scape"
        meta={
          <span>
            {rows.length} of {tank.hardscapeSlots} slots
          </span>
        }
      />
      <CardBody className="min-h-0 py-2 lg:overflow-y-auto">
        <div className="divide-y divide-hairline">
          <div className="flex min-h-[44px] items-center gap-2.5">
            <span className="text-[13px] text-ink-2">Substrate</span>
            <span className="ml-auto">
              <Select
                ariaLabel="Substrate"
                value={substrate}
                onChange={(value) => sim.updateSubstrateType(value as SubstrateType)}
                options={SUBSTRATE_TYPES.map((type) => ({
                  value: type,
                  label: SUBSTRATE_NAME[type],
                }))}
              />
            </span>
          </div>
          <div className="flex min-h-[30px] flex-wrap items-center gap-x-2 py-1 text-[11px] text-ink-3">
            <span className="font-mono tabular-nums">
              {SurfaceResource.format(getSubstrateSurface(substrate, tank.capacity))}
            </span>
            <span>· {substrateConsequence(substrate)}</span>
          </div>

          {rows.map((row) => (
            <div key={row.id} className="flex min-h-[44px] items-center gap-2.5 text-[13px]">
              <span className="truncate text-ink">{row.name}</span>
              <span className="ml-auto shrink-0 font-mono text-[12px] tabular-nums text-ink-2">
                {SurfaceResource.format(row.surface)}
              </span>
              <span className="w-[92px] shrink-0 truncate text-right text-[11px] text-ink-3">
                {row.effect ?? 'inert'}
              </span>
              <button
                type="button"
                onClick={() => sim.removeHardscapeItem(row.id)}
                aria-label={`Remove ${row.name}`}
                className="shrink-0 rounded p-0.5 text-ink-3 transition-colors hover:text-alert focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="mt-1 border-t border-hairline-2 pt-2">
          <div className="flex items-center gap-2.5">
            <span className="text-[13px] font-medium text-ink">Bacteria surface</span>
            <span className="ml-auto font-mono text-[14px] tabular-nums text-ink">
              {SurfaceResource.format(resources.surface)}
            </span>
          </div>
          <p className="pt-0.5 text-[11px] text-ink-3">
            Glass, substrate, hardscape and filter media — the biofilter’s ceiling.
          </p>
        </div>

        {footer && <div className="flex border-t border-hairline pt-2">{footer}</div>}
      </CardBody>
    </Card>
  );
}
