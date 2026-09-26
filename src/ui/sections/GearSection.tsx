import React, { useCallback, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { SurfaceResource } from '../../simulation/resources/index.js';
import type { TunableConfig } from '../../simulation/config/index.js';
import { DeviceDrawer } from '../components/gear/DeviceDrawer';
import { DeviceLine, powerSwitch, rackEntries } from '../components/gear/rack';
import { ScapeRows } from '../components/gear/scape';
import { ModuleGroup, ModulePage } from '../components/layout/ModulePage';
import { ReadingRow } from '../components/ui/ReadingRow';
import { ReadingDrawer } from '../components/water/ReadingDrawer';
import { equipmentSummary, hourLabel, isDeviceId, turnover } from '../build';
import { formatFlowRate } from '../utils/units';
import type { useSimulation } from '../hooks/useSimulation';
import { useInspector } from '../hooks/useInspector';
import { useQueryParam } from '../hooks/useQueryParam';
import { useReadingBook } from '../hooks/useReadingBook';
import { useUnits } from '../hooks/useUnits';

/** The palette's "Add hardscape" lands here, the way its pickers land on Life. */
const HARDSCAPE_PARAM = 'hardscape';

/**
 * The rack: every fitting as a row you can switch, read and open, the three
 * that keep a clock carrying it inline — so the schedules are the rows rather
 * than a band beneath them. Under it what the tank is built of, and under that
 * what the fittings add up to, which is what the tick actually reads.
 *
 * The open device is the URL: rows push, so back walks between devices, and
 * closing replaces, so it lands on the rack from wherever it was opened rather
 * than popping out of Gear. Every inspector is a link someone can send.
 */
export function GearSection({
  sim,
  config,
}: {
  sim: ReturnType<typeof useSimulation>;
  config: TunableConfig;
}): React.JSX.Element {
  const { deviceId } = useParams();
  const [add, setAdding] = useQueryParam<typeof HARDSCAPE_PARAM>('add');
  const navigate = useNavigate();
  const { unitSystem } = useUnits();
  const { state } = sim;

  const book = useReadingBook(sim, config);
  const close = useCallback(() => navigate('/gear', { replace: true }), [navigate]);
  const [reading, setReading] = useState<'dailyLight' | null>(null);
  const closeReading = useCallback(() => setReading(null), []);

  const entries = useMemo(() => rackEntries(book.rack), [book.rack]);
  const { hour } = book.rack.schedules;
  const onPower = powerSwitch(sim);
  const selected =
    deviceId && isDeviceId(deviceId)
      ? (entries.find((entry) => entry.row.id === deviceId) ?? null)
      : null;

  useInspector(selected !== null, close);
  useInspector(add === HARDSCAPE_PARAM, close);
  useInspector(reading !== null, closeReading);

  if (deviceId !== undefined && selected === null) return <Navigate to="/gear" replace />;

  const { resources } = state;
  const { dailyLight } = book.byId;
  const slots = state.equipment.hardscape.items.length;

  return (
    <>
      <ModulePage title="Gear" meta={equipmentSummary(state, book.bacteria)}>
        <div className="flex flex-col gap-1">
          <ModuleGroup title="Fittings" meta={`24 h · now ${hourLabel(hour)}`}>
            {entries.map((entry) => (
              <DeviceLine
                key={entry.row.id}
                entry={entry}
                hour={hour}
                layout="page"
                onPower={onPower}
              />
            ))}
          </ModuleGroup>

          <ModuleGroup title="Scape" meta={`${slots} of ${state.tank.hardscapeSlots} slots`}>
            <ScapeRows
              sim={sim}
              adding={add === HARDSCAPE_PARAM}
              onAdding={(open) => setAdding(open ? HARDSCAPE_PARAM : null)}
            />
          </ModuleGroup>

          <ModuleGroup title="What the tank gets" meta="summed from the fittings">
            <ReadingRow
              name="Bacteria surface"
              value={Math.round(resources.surface).toLocaleString()}
              unit={SurfaceResource.unit}
              note="glass, substrate, hardscape and media"
            />
            <ReadingRow
              name="Circulation"
              value={formatFlowRate(resources.flow, unitSystem)}
              note={
                resources.flow > 0
                  ? turnover(resources.flow, resources.water)
                  : 'nothing moving the water'
              }
            />
            <ReadingRow
              name="PAR at substrate"
              value={Math.round(resources.light).toString()}
              unit="PAR"
              note={resources.light > 0 ? 'through the water column' : 'lights out'}
            />
            <ReadingRow
              name={dailyLight.name}
              value={dailyLight.value}
              unit={dailyLight.unit}
              at={dailyLight.at}
              band={dailyLight.band}
              tone={dailyLight.tone}
              note={dailyLight.need}
              onClick={() => setReading('dailyLight')}
            />
            <ReadingRow
              name="Aeration"
              value={resources.aeration ? 'active' : 'none'}
              note={resources.aeration ? 'surface agitation, off-gassing CO₂' : 'gas exchange at the surface alone'}
            />
          </ModuleGroup>
        </div>
      </ModulePage>

      <DeviceDrawer
        entry={selected}
        sim={sim}
        config={config}
        ahead={book.ahead}
        hour={hour}
        onClose={close}
        onPower={onPower}
      />

      <ReadingDrawer id={reading} book={book} history={sim.history} onClose={closeReading} />
    </>
  );
}
