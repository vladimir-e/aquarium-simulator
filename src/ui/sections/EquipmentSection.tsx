import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import type { TunableConfig } from '../../simulation/config/index.js';
import type { useSimulation } from '../hooks/useSimulation';
import { useUnits } from '../hooks/useUnits';
import { useIsMobile } from '../hooks/useMediaQuery';
import { Stage } from '../components/layout/Stage';
import { Card } from '../components/run/Card';
import { DeviceList } from '../components/equipment/DeviceList';
import { DeviceInspector, PushedInspector } from '../components/equipment/DeviceInspector';
import { SchedulesBand } from '../components/equipment/SchedulesBand';
import { CONTROL_FOCUS } from '../components/ui/focus';
import {
  equipmentRows,
  equipmentSummary,
  filterRows,
  isEquipmentId,
  scheduleBand,
  type EquipmentId,
} from '../build';

/**
 * The device list and one device's inspector, side by side. Selection is the
 * URL, so back moves between devices and every inspector is a link someone can
 * send.
 */
export function EquipmentSection({
  sim,
  config,
}: {
  sim: ReturnType<typeof useSimulation>;
  config: TunableConfig;
}): React.JSX.Element {
  const { deviceId } = useParams();
  const { unitSystem } = useUnits();
  const isMobile = useIsMobile();
  const [query, setQuery] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const openRef = useRef<EquipmentId | null>(null);

  const selected: EquipmentId | null = deviceId && isEquipmentId(deviceId) ? deviceId : null;

  const rows = useMemo(
    () => equipmentRows(sim.state, config, unitSystem),
    [sim.state, config, unitSystem]
  );
  const band = useMemo(() => scheduleBand(sim.state), [sim.state]);
  const selectedRow = rows.find((row) => row.id === selected) ?? null;

  // Closing the pushed editor is a pop, so focus lands back on the row that
  // pushed it rather than at the top of the document.
  useEffect(() => {
    const wasOpen = openRef.current;
    openRef.current = selected;
    if (!isMobile || selected !== null || wasOpen === null) return;
    listRef.current?.querySelector<HTMLElement>(`[data-device="${wasOpen}"]`)?.focus();
  }, [selected, isMobile]);

  if (deviceId !== undefined && selected === null) {
    return <Navigate to="/equipment" replace />;
  }

  // The pushed inspector owns the whole phone screen, so the section behind it
  // is not rendered at all — no invisible list to tab into, no second inspector.
  if (isMobile && selectedRow) {
    return <PushedInspector row={selectedRow} sim={sim} config={config} />;
  }

  const search = (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3"
        aria-hidden
      />
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search"
        aria-label="Search equipment"
        className={`w-32 rounded-control border border-hairline bg-surface py-1 pl-8 pr-2 text-[13px] text-ink transition-colors placeholder:text-ink-3 hover:border-hairline-2 ${CONTROL_FOCUS}`}
      />
    </div>
  );

  return (
    <Stage title="Equipment" meta={equipmentSummary(sim.state, config)} actions={search}>
      <div className="flex min-h-full flex-col gap-3">
        <Card className="min-h-0 flex-1">
          <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
            <div
              ref={listRef}
              className={
                selectedRow
                  ? 'overflow-y-auto py-1 sm:w-[300px] sm:shrink-0 sm:border-r sm:border-hairline'
                  : 'flex-1 py-1'
              }
            >
              <DeviceList rows={filterRows(rows, query)} selected={selected} query={query} />
            </div>
            {selectedRow && (
              <div className="min-w-0 flex-1 overflow-y-auto px-4 pb-3">
                <DeviceInspector row={selectedRow} sim={sim} config={config} />
              </div>
            )}
          </div>
        </Card>

        <SchedulesBand band={band} />
      </div>
    </Stage>
  );
}
